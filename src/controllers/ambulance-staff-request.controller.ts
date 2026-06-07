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

/** GET /requests/active — the request currently assigned to this staff member. */
export const activeRequest = async (req: Request, _res: Response, next: NextFunction) => {
  const r: any = await AmbulanceRequest.findOne({
    driverStaffId: sid(req),
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
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/en-route — driving to the patient. */
export const enRoute = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  await notifyPatient(r, "EN_ROUTE", "Ambulance en route", "Your ambulance is on the way. Track it live.");
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
  req.rData = { request: r };
  req.msg = "success";
  return next();
};

/** POST /requests/:id/start — patient onboard, heading to hospital. */
export const startTrip = async (req: Request, _res: Response, next: NextFunction) => {
  const r = await own(req);
  if (!guard(req, next, r)) return;
  r.status = "ON_TRIP";
  await r.save();
  await notifyPatient(r, "ON_TRIP", "Trip started", "You are on the way to the hospital.");
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
      { status: "available" },
    ).catch(() => undefined);
  }
  await notifyPatient(r, "COMPLETED", "Trip completed", "Your ambulance trip is complete. Get well soon.");
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
