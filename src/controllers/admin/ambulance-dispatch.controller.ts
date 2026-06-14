import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import {
  getNearbyAmbulances,
  createDispatch,
  searchAmbulancesByMobile,
} from "../../services/ambulance-dispatch.service";
import { SOSAlert } from "../../models/sos.model";
import { SOSSubmission } from "../../models/sos-submission.model";
import { EmergencyDispatch } from "../../models/emergency-dispatch.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import Ambulance from "../../models/ambulance.model";
import { sendDispatchPush, sendToUser } from "../../services/notification.service";
import { emitToUser, emitToSosSubmission } from "../../utils/socket.util";

/** Find the app patient behind an SOS (submission or alert) for notify/track. */
const resolvePatientUserId = async (
  sosId: string,
): Promise<Types.ObjectId | null> => {
  const sub: any = await SOSSubmission.findById(sosId).select("userId").lean();
  if (sub?.userId) return sub.userId;
  const alert: any = await SOSAlert.findById(sosId).select("userId").lean();
  return alert?.userId || null;
};

const STALE_LOCATION_MS = 5 * 60 * 1000;

/**
 * The SOS dashboard fronts two different collections — patient-app SOS
 * (SOSAlert) and dashboard-submitted SOS (SOSSubmission, the
 * Calls/Forms/Downloads list). The ambulance picker UI passes whichever
 * `_id` it has; we resolve to a unified shape so the rest of the flow
 * doesn't care which path the SOS came in through.
 */
type ResolvedSos =
  | {
      ok: true;
      source: "ALERT" | "SUBMISSION";
      lat: number;
      lng: number;
      address: string;
      rejectedAmbulanceIds: Types.ObjectId[];
      isActive: boolean;
    }
  | { ok: false; kind: "not_found" | "no_location" };

const resolveSosLocation = async (sosId: string): Promise<ResolvedSos> => {
  const alert = await SOSAlert.findById(sosId);
  if (alert) {
    if (!alert.location?.coordinates) {
      return { ok: false, kind: "no_location" };
    }
    const [lng, lat] = alert.location.coordinates as [number, number];
    return {
      ok: true,
      source: "ALERT",
      lat,
      lng,
      address: alert.address || "",
      rejectedAmbulanceIds:
        (alert.rejectedAmbulanceIds || []) as Types.ObjectId[],
      isActive: alert.status === "ACTIVE",
    };
  }
  const sub = await SOSSubmission.findById(sosId);
  if (!sub) return { ok: false, kind: "not_found" };
  if (!sub.location?.coordinates) {
    return { ok: false, kind: "no_location" };
  }
  const [lng, lat] = sub.location.coordinates as [number, number];
  return {
    ok: true,
    source: "SUBMISSION",
    lat,
    lng,
    address: sub.address || "",
    rejectedAmbulanceIds: [],
    isActive: sub.status === "PENDING" || sub.status === "IN_PROGRESS",
  };
};

/**
 * When the nearby query returns zero ambulances, ops need to know *why* —
 * is the fleet empty, all off-duty, all on-dispatch, or all missing an
 * attendant? Single aggregate that buckets the whole fleet by failure
 * mode so the admin UI can render a concrete "X vehicles total, Y off
 * duty, Z missing attendant" line instead of the unhelpful "no
 * ambulances available".
 */
const fleetDiagnostics = async () => {
  const staleCutoff = new Date(Date.now() - STALE_LOCATION_MS);
  const rows = await Ambulance.aggregate([
    {
      $lookup: {
        from: "ambulancestaffs",
        localField: "assignedDriverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    {
      $lookup: {
        from: "ambulancestaffs",
        localField: "assignedAttendantId",
        foreignField: "_id",
        as: "attendant",
      },
    },
    {
      $project: {
        isActive: 1,
        status: 1,
        lastLocationAt: 1,
        hasDriver: { $gt: [{ $size: "$driver" }, 0] },
        hasAttendant: { $gt: [{ $size: "$attendant" }, 0] },
        driverOnline: { $ifNull: [{ $first: "$driver.isOnline" }, false] },
        attendantOnline: {
          $ifNull: [{ $first: "$attendant.isOnline" }, false],
        },
      },
    },
  ]);

  const stats = {
    total: rows.length,
    inactive: 0,
    onDispatch: 0,
    offline: 0,
    maintenance: 0,
    missingAttendant: 0,
    missingDriver: 0,
    driverOffDuty: 0,
    attendantOffDuty: 0,
    locationStale: 0,
    available: 0,
  };
  for (const r of rows) {
    if (!r.isActive) stats.inactive++;
    if (r.status === "on_dispatch") stats.onDispatch++;
    if (r.status === "offline") stats.offline++;
    if (r.status === "maintenance") stats.maintenance++;
    if (!r.hasAttendant) stats.missingAttendant++;
    if (!r.hasDriver) stats.missingDriver++;
    if (r.hasDriver && !r.driverOnline) stats.driverOffDuty++;
    if (r.hasAttendant && !r.attendantOnline) stats.attendantOffDuty++;
    if (!r.lastLocationAt || r.lastLocationAt < staleCutoff) {
      stats.locationStale++;
    }
    if (
      r.isActive &&
      r.status === "available" &&
      r.hasDriver &&
      r.hasAttendant &&
      // New rule: at least one crew member online is enough.
      // NOTE: live-GPS / stale-location is NO LONGER a dispatch gate (GPS not
      // available yet) — a vehicle is dispatchable on crew + status alone.
      (r.driverOnline || r.attendantOnline)
    ) {
      stats.available++;
    }
  }
  return stats;
};

export const nearbyAmbulances = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const sos = await resolveSosLocation((req.params.sosId as string));
  if (!sos.ok) {
    if (sos.kind === "not_found") {
      req.rCode = 5;
      req.msg = "sos_not_found";
      req.rData = { reason: "not_found" };
      return next();
    }
    // "no_location" is a known state, not an error — return 200 with an
    // empty ambulance list and a reason the UI can render. Treating it
    // as 404 makes fetch throw and the data payload (reason) is lost.
    req.rCode = 1;
    req.msg = "success";
    req.rData = { ambulances: [], reason: "no_location" };
    return next();
  }
  // Default 10km — admins can pass ?radiusKm=N to widen for rural ops
  // or narrow during high-density events. radiusKm=0 disables the cap.
  const radiusKm =
    req.query.radiusKm != null
      ? Math.max(0, parseFloat(String(req.query.radiusKm)))
      : 10;
  const results = await getNearbyAmbulances(
    sos.lat,
    sos.lng,
    sos.rejectedAmbulanceIds,
    10,
    radiusKm,
  );

  // Empty result is the hard one to debug from a screenshot — run the
  // fleet diagnostic so the empty-state in the UI can explain which
  // filter eliminated the candidates instead of just "no ambulances".
  const diagnostics = results.length === 0 ? await fleetDiagnostics() : null;

  req.rData = {
    ambulances: results,
    patient: { lat: sos.lat, lng: sos.lng, address: sos.address },
    ...(diagnostics ? { diagnostics } : {}),
  };
  req.msg = "nearby_ambulances";
  next();
};

export const dispatch = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = req.adminId!;
  const { ambulanceId } = req.body as { ambulanceId: string };

  const sos = await resolveSosLocation((req.params.sosId as string));
  if (!sos.ok) {
    req.rCode = 5;
    req.msg =
      sos.kind === "no_location" ? "sos_no_location" : "sos_not_found";
    req.rData = {};
    return next();
  }
  if (!sos.isActive) {
    req.rCode = 0;
    req.msg = "sos_not_active";
    req.rData = {};
    return next();
  }

  const { lat, lng } = sos;

  // Re-run nearby to get authoritative roadDistanceKm / etaMinutes.
  // No radius cap here — the admin already picked this ambulance
  // (possibly via the by-mobile search override which intentionally
  // goes outside the default 10km), we just need its current distance.
  const nearby = await getNearbyAmbulances(
    lat,
    lng,
    sos.rejectedAmbulanceIds,
    50,
    0,
  );
  const picked = nearby.find((n) => n.ambulanceId === String(ambulanceId));
  if (!picked) {
    req.rCode = 0;
    req.msg = "ambulance_not_available_for_dispatch";
    req.rData = {};
    return next();
  }

  let dispatchDoc: any;
  try {
    dispatchDoc = await createDispatch({
      sosId: new Types.ObjectId((req.params.sosId as string)),
      ambulanceId: new Types.ObjectId(picked.ambulanceId),
      adminId: new Types.ObjectId(adminId),
      roadDistanceKm: picked.roadDistanceKm,
      etaMinutes: picked.etaMinutes,
      patientLat: lat,
      patientLng: lng,
    });
  } catch (err: any) {
    if (err?.message === "ambulance_not_available") {
      req.rCode = 0;
      req.msg = "ambulance_not_available";
      req.rData = {};
      return next();
    }
    throw err;
  }

  // Link the SOS patient + mint a pickup OTP, so the patient app can flip to
  // live tracking and the crew can verify the patient at pickup.
  const patientUserId = await resolvePatientUserId(req.params.sosId as string);
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  await EmergencyDispatch.updateOne(
    { _id: dispatchDoc._id },
    { patientUserId: patientUserId || undefined, otp },
  );
  dispatchDoc.otp = otp;
  dispatchDoc.patientUserId = patientUserId;

  // Fetch driver & attendant for FCM tokens
  const [driver, attendant] = await Promise.all([
    AmbulanceStaff.findById(picked.driverId).select("fcmToken").lean(),
    AmbulanceStaff.findById(picked.attendantId).select("fcmToken").lean(),
  ]);

  const payload: Record<string, string | number | boolean> = {
    dispatchId: String(dispatchDoc._id),
    sosId: String((req.params.sosId as string)),
    patientLat: lat,
    patientLng: lng,
    address: sos.address || "",
    roadDistanceKm: picked.roadDistanceKm,
    etaMinutes: picked.etaMinutes,
  };

  const dataForFcm: Record<string, string> = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, String(v)]),
  );

  // Both pushes go through the dispatch channel so the driver app
  // surfaces them as a ringing heads-up (Importance.max + vibration
  // pattern) rather than the regular notification beep. The two
  // recipients differ only in `action` — the app routes that to either
  // the Accept/Reject modal (driver) or the "Patient inbound" modal
  // (attendant).
  if (driver?.fcmToken) {
    sendDispatchPush(
      driver.fcmToken,
      "Emergency Dispatch",
      `Patient ${picked.roadDistanceKm} km away — ETA ${picked.etaMinutes} min`,
      { ...dataForFcm, action: "incoming_dispatch" },
    ).catch((e) => console.error("FCM driver send failed:", e));
  }
  if (attendant?.fcmToken) {
    sendDispatchPush(
      attendant.fcmToken,
      "Patient Inbound",
      `${picked.roadDistanceKm} km away · ETA ${picked.etaMinutes} min — prepare to mobilise.`,
      { ...dataForFcm, action: "incoming_dispatch_info" },
    ).catch((e) => console.error("FCM attendant send failed:", e));
  }

  // For dashboard-sourced SOS (calls/forms), createDispatch's SOSAlert
  // updateOne is a no-op (no matching doc). Flip the submission status
  // here so the row visibly moves to "In Progress" in the dashboard.
  if (sos.source === "SUBMISSION") {
    await SOSSubmission.updateOne(
      { _id: (req.params.sosId as string), status: "PENDING" },
      {
        status: "IN_PROGRESS",
        respondedBy: new Types.ObjectId(adminId),
        respondedAt: new Date(),
      },
    );
  }

  emitToUser(picked.driverId, "dispatch:incoming", payload);
  emitToUser(picked.attendantId, "dispatch:incoming_info", payload);
  emitToUser(String(adminId), "sos:dispatched", {
    sosId: String((req.params.sosId as string)),
    dispatchId: String(dispatchDoc._id),
  });

  // Public website caller (anonymous) watching this submission → "ambulance on
  // the way" with ETA.
  if (sos.source === "SUBMISSION") {
    emitToSosSubmission(String((req.params.sosId as string)), "DISPATCHED", {
      dispatchId: String(dispatchDoc._id),
      etaMinutes: picked.etaMinutes,
    });
  }

  // Notify the SOS patient — their app flips from "SOS sent" to live tracking.
  if (patientUserId) {
    emitToUser(String(patientUserId), "booking:accepted", {
      dispatchId: String(dispatchDoc._id),
      status: "ASSIGNED",
      etaMinutes: picked.etaMinutes,
      otp,
    });
    await sendToUser(
      patientUserId as any,
      "BOOKING",
      "Ambulance dispatched 🚑",
      `Help is on the way — ETA ${picked.etaMinutes} min. Share OTP ${otp} with the crew.`,
      { route: "Tracking", dispatchId: String(dispatchDoc._id), screen: "Tracking" },
    ).catch(() => undefined);
  }

  req.rData = { dispatch: dispatchDoc, picked };
  req.msg = "dispatch_created";
  next();
};

/**
 * Search the fleet by driver/attendant mobile number. Used by the admin
 * picker as an escape hatch when ops needs a specific ambulance and
 * doesn't want to wait for the geo / duty filters to align — e.g.
 * "give me Vikas's vehicle even if he hasn't toggled duty yet."
 */
export const searchAmbulances = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const mobile = String(req.query.mobile || "").trim();
  if (mobile.length < 3) {
    req.rData = { ambulances: [], reason: "search_too_short" };
    req.msg = "search_too_short";
    return next();
  }
  // Use the SOS coords if available so the search still shows distance.
  const sos = await resolveSosLocation((req.params.sosId as string));
  const lat = sos.ok ? sos.lat : undefined;
  const lng = sos.ok ? sos.lng : undefined;
  const results = await searchAmbulancesByMobile(mobile, lat, lng);
  req.rData = {
    ambulances: results,
    patient: lat != null && lng != null ? { lat, lng } : null,
  };
  req.msg = "search_results";
  next();
};

export const getDispatchForSos = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const dispatchDoc = await EmergencyDispatch.findOne({
    sosSubmission: (req.params.sosId as string),
    dispatchType: "AMBULANCE",
  })
    .sort({ createdAt: -1 })
    .populate("ambulanceId")
    .populate("driverStaffId")
    .populate("attendantStaffId")
    .lean();

  if (!dispatchDoc) {
    req.rCode = 5;
    req.msg = "dispatch_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { dispatch: dispatchDoc };
  req.msg = "dispatch_detail";
  next();
};

export const listDispatches = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const {
    status,
    ambulanceId,
    providerId,
    page = "1",
    limit = "20",
  } = req.query as any;

  const filter: any = { dispatchType: "AMBULANCE" };
  if (status) filter.status = status;
  if (ambulanceId) filter.ambulanceId = ambulanceId;

  const pg = Math.max(1, parseInt(page as string, 10));
  const lim = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

  let query = EmergencyDispatch.find(filter)
    .sort({ createdAt: -1 })
    .skip((pg - 1) * lim)
    .limit(lim)
    .populate({
      path: "ambulanceId",
      populate: { path: "providerId", select: "name" },
    })
    .populate("driverStaffId", "fullName mobileNumber")
    .populate("attendantStaffId", "fullName mobileNumber");

  const [items, total] = await Promise.all([
    query.lean(),
    EmergencyDispatch.countDocuments(filter),
  ]);

  let filtered = items;
  if (providerId) {
    filtered = items.filter((it: any) => {
      const prov = it?.ambulanceId?.providerId;
      return prov && String(prov._id || prov) === String(providerId);
    });
  }

  req.rData = {
    items: filtered,
    total,
    page: pg,
    limit: lim,
  };
  req.msg = "dispatches_listed";
  next();
};

/**
 * Manual override — cancel the active dispatch for an SOS. Frees the
 * ambulance (back to "available"), reverts the SOS to its actionable
 * state, and marks the dispatch CANCELLED. After this the admin can
 * dispatch a different ambulance (i.e. reassign = cancel + re-dispatch).
 */
export const cancelDispatch = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = req.adminId!;

  const dispatch: any = await EmergencyDispatch.findOne({
    sosSubmission: (req.params.sosId as string),
    status: { $in: ["DISPATCHED", "ACKNOWLEDGED", "EN_ROUTE", "ON_SCENE"] },
  }).sort({ dispatchedAt: -1 });

  if (!dispatch) {
    req.rCode = 5;
    req.msg = "dispatch_not_found";
    req.rData = {};
    return next();
  }

  dispatch.status = "CANCELLED";
  await dispatch.save();

  // Release the ambulance so it (and its crew) can take another run.
  if (dispatch.ambulanceId) {
    await Ambulance.updateOne(
      { _id: dispatch.ambulanceId },
      { status: "available", currentDispatchId: null },
    );
  }

  // Revert the SOS to the state createDispatch advanced it from, so it
  // reappears in the actionable queue for re-dispatch.
  await SOSAlert.updateOne(
    { _id: (req.params.sosId as string), status: "RESPONDED" },
    { status: "ACTIVE" },
  );
  await SOSSubmission.updateOne(
    { _id: (req.params.sosId as string), status: "IN_PROGRESS" },
    { status: "PENDING" },
  );

  // Best-effort notifications.
  if (dispatch.driverStaffId)
    emitToUser(String(dispatch.driverStaffId), "dispatch:cancelled", {
      dispatchId: String(dispatch._id),
      sosId: String((req.params.sosId as string)),
    });
  if (dispatch.attendantStaffId)
    emitToUser(String(dispatch.attendantStaffId), "dispatch:cancelled", {
      dispatchId: String(dispatch._id),
      sosId: String((req.params.sosId as string)),
    });
  emitToUser(String(adminId), "sos:dispatch-cancelled", {
    sosId: String((req.params.sosId as string)),
    dispatchId: String(dispatch._id),
  });

  req.rData = { dispatch };
  req.msg = "dispatch_cancelled";
  next();
};
