import { Request, Response, NextFunction } from "express";
import AmbulanceRequest from "../../models/ambulance-request.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { emitToUser } from "../../utils/socket.util";
import { sendToUser, sendDispatchPush } from "../../services/notification.service";

/**
 * Admin dispatch for patient ambulance requests. List incoming requests and
 * assign an ambulance + driver. On assignment the user is notified in real time
 * (socket `booking:accepted` / `booking:status`) and via FCM push, so the app
 * flips from "Finding an ambulance" to live tracking.
 */

const ACTIVE = ["SEARCHING", "ASSIGNED", "ARRIVED", "ON_TRIP"];

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  else query.status = { $in: ACTIVE }; // default: open requests
  const items = await AmbulanceRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("userId", "fullName mobileNumber")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const detail = async (req: Request, _res: Response, next: NextFunction) => {
  const item = await AmbulanceRequest.findById(req.params.id)
    .populate("userId", "fullName mobileNumber")
    .lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  req.rData = { item };
  req.msg = "success";
  return next();
};

/** POST /:id/assign — attach driver/ambulance, notify the user live + push. */
export const assign = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const reqDoc = await AmbulanceRequest.findById(req.params.id);
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }

  reqDoc.driverName = b.driverName;
  reqDoc.driverPhone = b.driverPhone;
  reqDoc.vehicleNumber = b.vehicleNumber;
  reqDoc.etaMinutes = b.etaMinutes != null ? Number(b.etaMinutes) : reqDoc.etaMinutes;
  if (b.ambulanceId) reqDoc.ambulanceId = b.ambulanceId;
  if (b.driverStaffId) reqDoc.driverStaffId = b.driverStaffId;
  reqDoc.status = "ASSIGNED";
  reqDoc.assignedAt = new Date();
  if (!reqDoc.otp) reqDoc.otp = String(Math.floor(1000 + Math.random() * 9000));
  await reqDoc.save();

  const userId = String(reqDoc.userId);
  const payload = {
    requestId: String(reqDoc._id),
    status: "ASSIGNED",
    driverName: reqDoc.driverName,
    vehicleNumber: reqDoc.vehicleNumber,
    etaMinutes: reqDoc.etaMinutes,
    otp: reqDoc.otp,
  };
  // Real-time: the app's socket listener refreshes the active ride on these.
  emitToUser(userId, "booking:accepted", payload);
  emitToUser(userId, "booking:status", payload);
  // Push (FCM) — reaches the device even if the app is backgrounded; tapping
  // it deep-links to tracking via data.route.
  await sendToUser(
    reqDoc.userId as any,
    "BOOKING",
    "Ambulance assigned",
    `${reqDoc.driverName || "A driver"} is on the way${reqDoc.vehicleNumber ? ` (${reqDoc.vehicleNumber})` : ""}.`,
    { route: "Tracking", requestId: String(reqDoc._id), screen: "Tracking" },
  ).catch(() => undefined);

  // Ring the assigned ambulance crew's app (driver/staff) — socket for an
  // instant in-app modal + FCM dispatch push so it pierces a backgrounded app.
  if (reqDoc.driverStaffId) {
    const staffId = String(reqDoc.driverStaffId);
    const dispatchPayload = {
      requestId: String(reqDoc._id),
      kind: "request",
      patientName: reqDoc.patientName || "Patient",
      patientPhone: reqDoc.recipientPhone || undefined,
      address: reqDoc.pickup?.address || "Patient location",
      patientLat: reqDoc.pickup?.lat,
      patientLng: reqDoc.pickup?.lng,
      etaMinutes: reqDoc.etaMinutes,
      priority: reqDoc.emergency ? "CRITICAL" : "HIGH",
    };
    emitToUser(staffId, "dispatch:incoming", dispatchPayload);
    const staff: any = await AmbulanceStaff.findById(staffId).select("fcmToken").lean();
    if (staff?.fcmToken) {
      sendDispatchPush(
        staff.fcmToken,
        reqDoc.emergency ? "🚨 Emergency Dispatch" : "New Ambulance Dispatch",
        `${reqDoc.patientName || "A patient"} needs pickup — ${reqDoc.pickup?.address || "tap to view"}.`,
        {
          requestId: String(reqDoc._id),
          kind: "request",
          action: "incoming_dispatch",
          route: "IncomingDispatch",
        },
      ).catch(() => undefined);
    }
  }

  req.rData = { item: reqDoc };
  req.msg = "success";
  return next();
};

/** POST /:id/status — advance ARRIVED / ON_TRIP / COMPLETED / CANCELLED. */
export const updateStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toUpperCase();
  const allowed = ["ARRIVED", "ON_TRIP", "COMPLETED", "CANCELLED"];
  if (!allowed.includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `status must be one of ${allowed.join(", ")}` };
    return next();
  }
  const reqDoc = await AmbulanceRequest.findByIdAndUpdate(
    (req.params.id as string),
    { $set: { status } },
    { new: true },
  );
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  const userId = String(reqDoc.userId);
  emitToUser(userId, "booking:status", { requestId: String(reqDoc._id), status });
  req.rData = { item: reqDoc };
  req.msg = "success";
  return next();
};
