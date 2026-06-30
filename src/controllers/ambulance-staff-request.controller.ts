import { Request, Response, NextFunction } from "express";
import AmbulanceRequest from "../models/ambulance-request.model";
import Ambulance from "../models/ambulance.model";
import { emitToUser } from "../utils/socket.util";
import { sendToUser } from "../services/notification.service";

/**
 * Ambulance-staff actions on a patient AmbulanceRequest (the SOS / "Book
 * Ambulance" backbone). Mirrors the EmergencyDispatch action flow but operates
 * on AmbulanceRequest so the patient's live-tracking screen stays in sync.
 * Each transition pushes a `booking:status` socket event + FCM to the patient.
 */

const sid = (req: Request) => String((req as any).staffId);

const ACTIVE = ["ASSIGNED", "ARRIVED", "ON_TRIP"];

const notifyPatient = async (
  reqDoc: any,
  status: string,
  title: string,
  body: string,
) => {
  const userId = String(reqDoc.userId);
  emitToUser(userId, "booking:status", { requestId: String(reqDoc._id), status });
  await sendToUser(
    reqDoc.userId,
    "BOOKING",
    title,
    body,
    { route: "Tracking", requestId: String(reqDoc._id), screen: "Tracking" },
  ).catch(() => undefined);
};

/**
 * Mirror the trip status to the riding-along ATTENDANT (read-only). Their app
 * follows the driver via `dispatch:status` (ride-along), and `dispatch:resolved`
 * clears their card on completion — same contract as the SOS dispatch flow.
 */
const notifyAttendant = (reqDoc: any, status: string) => {
  if (!reqDoc.attendantStaffId) return;
  const attId = String(reqDoc.attendantStaffId);
  const dispatchId = String(reqDoc._id);
  emitToUser(attId, "dispatch:status", { dispatchId, status });
  if (status === "COMPLETED") {
    emitToUser(attId, "dispatch:resolved", { dispatchId });
  }
};

/** GET /requests/active — the request currently assigned to this staff member. */
export const activeRequest = async (req: Request, _res: Response, next: NextFunction) => {
  const r: any = await AmbulanceRequest.findOne({
    // Driver OR attendant — so the attendant's app also loads the active trip.
    $or: [{ driverStaffId: sid(req) }, { attendantStaffId: sid(req) }],
    status: { $in: ACTIVE },
  } as any)
    .sort({ assignedAt: -1 })
    .populate("userId", "fullName mobileNumber countryCode")
    .lean();
  req.rData = {
    request: r
      ? {
          _id: r._id,
          status: r.status,
          patientName: r.patientName || (r.userId as any)?.fullName || "Patient",
          patientPhone: (r.userId as any)?.mobileNumber
            ? `${(r.userId as any).countryCode || ""}${(r.userId as any).mobileNumber}`
            : "",
          pickup: r.pickup || null,
          drop: r.drop || null,
          etaMinutes: r.etaMinutes ?? null,
          otp: r.otp || null,
        }
      : null,
  };
  req.msg = "success";
  return next();
};

const own = async (req: Request) => {
  const r: any = await AmbulanceRequest.findOne({
    _id: (req.params.id as string),
    driverStaffId: sid(req),
  });
  return r;
};

const guard = (req: Request, next: NextFunction, r: any): boolean => {
  if (!r) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    next();
    return false;
  }
  return true;
};

/** POST /requests/:id/accept — crew acknowledges the dispatch. */
export const accept = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  await notifyPatient(r, "ASSIGNED", "Crew on the way", "Your ambulance crew has acknowledged and is preparing to move.");
  notifyAttendant(r, "ACKNOWLEDGED");
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/en-route — driving to the patient. */
export const enRoute = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  await notifyPatient(r, "EN_ROUTE", "Ambulance en route", "Your ambulance is on the way. Track it live.");
  notifyAttendant(r, "EN_ROUTE");
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/arrived — reached the patient. */
export const arrived = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  r.status = "ARRIVED";
  await r.save();
  await notifyPatient(r, "ARRIVED", "Ambulance arrived", "Your ambulance has reached the pickup point.");
  notifyAttendant(r, "ARRIVED");
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/start — patient onboard, heading to hospital. */
export const startTrip = async (req: Request, res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  // Verify the patient's OTP before the trip can start (the patient sees this
  // OTP in their tracking screen and reads it out to the crew).
  const otp = String(req.body?.otp || "").trim();
  if (r.otp && otp !== String(r.otp)) {
    return res
      .status(400)
      .json({ rCode: 0, rMsg: "Incorrect OTP. Ask the patient again.", rData: {} });
  }
  r.status = "ON_TRIP";
  await r.save();
  await notifyPatient(r, "ON_TRIP", "Trip started", "You are on the way to the hospital.");
  notifyAttendant(r, "ON_TRIP");
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/complete — trip done; free the ambulance. */
export const complete = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  r.status = "COMPLETED";
  await r.save();
  if (r.ambulanceId) {
    await Ambulance.updateOne(
      { _id: r.ambulanceId },
      { status: "available", currentDispatchId: null },
    ).catch(() => undefined);
  }
  await notifyPatient(r, "COMPLETED", "Trip completed", "Your ambulance trip is complete. Get well soon.");
  notifyAttendant(r, "COMPLETED");
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/**
 * POST /requests/:id/reject — crew declines the dispatch (same as SOS reject).
 * Releases the reserved ambulance, reverts the request to SEARCHING so admin can
 * re-dispatch, and clears the assignment so the patient app shows "Finding…".
 */
export const reject = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  if (r.ambulanceId) {
    await Ambulance.updateOne(
      { _id: r.ambulanceId },
      { status: "available", currentDispatchId: null },
    ).catch(() => undefined);
  }
  const userId = String(r.userId);
  // Clear the attendant's ride-along card before we drop the assignment.
  if (r.attendantStaffId) {
    emitToUser(String(r.attendantStaffId), "dispatch:cancelled", { dispatchId: String(r._id) });
  }
  r.status = "SEARCHING";
  r.ambulanceId = undefined;
  r.driverStaffId = undefined;
  r.attendantStaffId = undefined;
  r.driverName = undefined;
  r.driverPhone = undefined;
  r.vehicleNumber = undefined;
  r.etaMinutes = undefined;
  r.assignedAt = undefined;
  await r.save();
  // Patient app flips back to "Finding an ambulance".
  emitToUser(userId, "booking:status", { requestId: String(r._id), status: "SEARCHING" });
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/destination — crew sets the drop-off hospital. */
export const setDestination = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  const b = req.body || {};
  r.drop = {
    address: b.address,
    lat: b.lat != null ? Number(b.lat) : undefined,
    lng: b.lng != null ? Number(b.lng) : undefined,
  };
  await r.save();
  emitToUser(String(r.userId), "booking:status", {
    requestId: String(r._id),
    status: r.status,
    drop: r.drop,
  });
  req.rData = { request: r };
  req.msg = "success";
  return next();
};
