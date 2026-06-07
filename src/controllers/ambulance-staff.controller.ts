import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import AmbulanceStaff from "../models/ambulance-staff.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceServiceProvider from "../models/ambulance-service-provider.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import { AmbulanceRequest } from "../models/ambulance-request.model";
import { Notification } from "../models/notification.model";
import { emitToUser } from "../utils/socket.util";
import { haversineKm, etaMinutesFromKm } from "../utils/geo.util";
import Shift from "../models/shift.model";
import OffDutyReason from "../models/off-duty-reason.model";
import DutyEvent from "../models/duty-event.model";
import { uploadFileToAws } from "../utils/s3";
import config from "../config";

// Drivers/attendants are allowed to clock in this many ms before their
// shift's startAt — matches the state-machine's grace window so a 5-min-
// early arrival lights the button.
const CLOCK_IN_LEAD_MS = 15 * 60 * 1000;

export const me = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const staff = await AmbulanceStaff.findById(staffId).lean();
  if (!staff) {
    return res
      .status(404)
      .json({ rCode: 0, rMsg: "not_found", rData: {} });
  }

  const provider = await AmbulanceServiceProvider.findById(staff.providerId)
    .select("name")
    .lean();

  const assignedAmbulance = await Ambulance.findOne({
    $or: [{ assignedDriverId: staff._id }, { assignedAttendantId: staff._id }],
    isActive: true,
  }).lean();

  // hasFcmToken is exposed so the driver app can decide whether to keep
  // the session or force a re-login. A session with no FCM token can't
  // receive dispatch pings — useless for a dispatch app — so the safest
  // action is to bounce the user back to OTP and re-attempt the upload.
  req.rData = {
    staff,
    provider,
    assignedAmbulance,
    hasFcmToken: !!(staff as any).fcmToken,
  };
  req.msg = "me";
  next();
};

export const setDuty = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const { isDutyOn, reasonId, notes } = req.body;

  // Going OFF duty requires an admin-managed reason. ON duty does not.
  // The validator already enforced the shape; here we just verify the
  // reason exists and is still active so a stale picker selection can't
  // sneak in.
  let reasonLabel: string | undefined;
  if (isDutyOn === false) {
    if (!reasonId) {
      return res
        .status(400)
        .json({ rCode: 0, rMsg: "reason_required", rData: {} });
    }
    const reason = await OffDutyReason.findById(reasonId).lean();
    if (!reason || !reason.isActive) {
      return res
        .status(400)
        .json({ rCode: 0, rMsg: "invalid_reason", rData: {} });
    }
    reasonLabel = reason.label;
  }

  const staff = await AmbulanceStaff.findByIdAndUpdate(
    staffId,
    {
      isDutyOn,
      isOnline: isDutyOn,
      lastSeenAt: new Date(),
    },
    { returnDocument: "after" },
  );
  if (!staff) {
    return res
      .status(404)
      .json({ rCode: 0, rMsg: "not_found", rData: {} });
  }

  // Audit row — captured regardless of role so ops can review patterns
  // across the fleet. Label is snapshotted so future renames of the
  // master reason list don't rewrite history.
  await DutyEvent.create({
    staffId: staff._id,
    // Attendants (hospital staff) have no provider — coalesce null to
    // undefined so the DutyEvent row simply omits the field.
    providerId: staff.providerId ?? undefined,
    type: isDutyOn ? "on_duty" : "off_duty",
    reasonId: isDutyOn ? undefined : reasonId,
    reasonLabel: isDutyOn ? undefined : reasonLabel,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : undefined,
    at: new Date(),
  });

  // Vehicle availability reflects EITHER crew member being on duty —
  // previously required both, but that hid vehicles from dispatch even
  // when one crew member was clearly reachable. The dispatch FCM fans
  // out to both anyway; the off-duty crew gets the ringing alert and
  // can join. Vehicle flips back to offline only when ALL on-duty crew
  // toggle off.
  const amb =
    staff.role === "driver"
      ? await Ambulance.findOne({ assignedDriverId: staff._id })
      : await Ambulance.findOne({ assignedAttendantId: staff._id });
  if (amb && amb.status !== "on_dispatch" && amb.status !== "maintenance") {
    if (isDutyOn) {
      if (amb.status !== "available") {
        amb.status = "available";
        await amb.save();
      }
    } else {
      // Check if the OTHER crew slot is still on duty before flipping
      // back to offline — they may still be in the cab.
      const otherId =
        staff.role === "driver"
          ? amb.assignedAttendantId
          : amb.assignedDriverId;
      const other = otherId
        ? await AmbulanceStaff.findById(otherId).select("isOnline")
        : null;
      if (!other?.isOnline && amb.status === "available") {
        amb.status = "offline";
        await amb.save();
      }
    }
  }

  req.rData = { isDutyOn: staff.isDutyOn };
  req.msg = "duty_set";
  next();
};

export const updateLocation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const { lat, lng } = req.body;
  const now = new Date();

  // Stamp the attempt FIRST, before any other check. The detail page
  // reads this to tell "the device is sending pings but the backend
  // can't act on them" from "the device hasn't sent any pings at all".
  const staff = await AmbulanceStaff.findByIdAndUpdate(
    staffId,
    { lastSeenAt: now, lastLocationAttemptAt: now },
    { returnDocument: "after" },
  );
  if (!staff) {
    console.warn(`[updateLocation] REJECTED 404 — staffId=${staffId} not found`);
    return res
      .status(404)
      .json({ rCode: 0, rMsg: "not_found", rData: {} });
  }

  // Either crew member can report the vehicle's position — they're both
  // physically in the same ambulance. Previously this was gated to drivers
  // only, which meant attendants (who often outnumber drivers on duty)
  // pinged into a 403 void and the vehicle's lastLocationAt never
  // refreshed. Letting attendants also write keeps the vehicle visible
  // to dispatch whenever ANY on-duty crew member is in the cab.
  const amb = await Ambulance.findOneAndUpdate(
    {
      $or: [
        { assignedDriverId: staff._id },
        { assignedAttendantId: staff._id },
      ],
      isActive: true,
    },
    {
      currentLocation: { type: "Point", coordinates: [lng, lat] },
      lastLocationAt: new Date(),
    },
    { returnDocument: "after" },
  );

  if (!amb) {
    console.warn(
      `[updateLocation] ORPHANED — ${staff.role} ${staff.fullName} (${staff.mobileNumber}) is on duty but NOT linked to any ambulance. Location dropped.`,
    );
  } else {
    console.log(
      `[updateLocation] OK — ${amb.registrationNumber} @ [${lat.toFixed(5)}, ${lng.toFixed(5)}] from ${staff.role} ${staff.fullName}`,
    );
  }

  // Mirror the live position onto the active patient-app AmbulanceRequest
  // assigned to this staff, then push it to the patient so their tracking
  // screen shows how far the ambulance is — in real time.
  if (typeof lat === "number" && typeof lng === "number") {
    const activeReq: any = await AmbulanceRequest.findOneAndUpdate(
      {
        driverStaffId: staff._id,
        status: { $in: ["ASSIGNED", "ARRIVED", "ON_TRIP"] },
      },
      { driverLocation: { lat, lng }, lastLocationAt: now },
      { returnDocument: "after", new: true },
    );
    if (activeReq) {
      const distanceKm = haversineKm(activeReq.pickup, { lat, lng });
      const etaMinutes = etaMinutesFromKm(distanceKm) ?? activeReq.etaMinutes ?? null;
      emitToUser(String(activeReq.userId), "ambulance:location", {
        requestId: String(activeReq._id),
        lat,
        lng,
        distanceKm,
        etaMinutes,
      });
    }
  }

  req.rData = { ambulanceId: amb?._id || null };
  req.msg = "location_updated";
  next();
};

/**
 * Staff can update ONLY their own profile photo. All other profile fields
 * (name, email, license number, gender, dob, …) are admin-managed via the
 * /admin/ambulance-staff endpoints — there is intentionally no general-purpose
 * "update me" endpoint here.
 */
export const updateProfilePhoto = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const files = req.files as Express.Multer.File[] | undefined;
  if (!Array.isArray(files) || files.length === 0) {
    return res
      .status(400)
      .json({ rCode: 0, rMsg: "no_file", rData: {} });
  }
  const { images: url } = await uploadFileToAws(files);
  const staff = await AmbulanceStaff.findByIdAndUpdate(
    staffId,
    { profilePhoto: url },
    { returnDocument: "after" },
  ).lean();
  if (!staff) {
    return res
      .status(404)
      .json({ rCode: 0, rMsg: "not_found", rData: {} });
  }
  req.rData = { profilePhoto: staff.profilePhoto, staff };
  req.msg = "profile_photo_updated";
  next();
};

/**
 * Reasons the staff app shows in the "going off duty" picker. Only
 * active reasons are returned, sorted by the admin-defined sortOrder so
 * the most-used ones can be pinned at the top.
 */
export const listOffDutyReasons = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const items = await OffDutyReason.find({ isActive: true })
    .sort({ sortOrder: 1, label: 1 })
    .select("label sortOrder")
    .lean();
  req.rData = { items };
  req.msg = "off_duty_reasons_listed";
  next();
};

export const updateFcmToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const { fcmToken } = req.body || {};
  // Audit log so "did the device actually upload?" is answerable from the
  // server console alone. Mask the token but keep enough to differentiate
  // refreshes from the same device.
  const tail = typeof fcmToken === "string" ? fcmToken.slice(-8) : null;
  console.log(
    `[FCM] updateFcmToken staff=${staffId} hasToken=${!!fcmToken} tail=${tail}`,
  );
  if (!fcmToken || typeof fcmToken !== "string") {
    req.rCode = 0;
    req.msg = "fcm_token_missing";
    req.rData = {};
    return next();
  }
  const result = await AmbulanceStaff.updateOne(
    { _id: staffId },
    { fcmToken, lastSeenAt: new Date() },
  );
  console.log(
    `[FCM] updateFcmToken result staff=${staffId} matched=${result.matchedCount} modified=${result.modifiedCount}`,
  );
  req.rData = { saved: result.modifiedCount > 0 };
  req.msg = "fcm_token_updated";
  next();
};

export const activeDispatch = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const d = await EmergencyDispatch.findOne({
    $or: [{ driverStaffId: staffId }, { attendantStaffId: staffId }],
    status: { $in: ["DISPATCHED", "ACKNOWLEDGED", "EN_ROUTE", "ON_SCENE"] },
  })
    .populate("ambulanceId")
    .lean();
  req.rData = { dispatch: d || null };
  req.msg = "active_dispatch";
  next();
};

/**
 * Shifts assigned to the current staff member. The driver app uses this
 * for the "My shifts" surface — defaults to the upcoming + current
 * window, with a `range=past` query for history.
 */
export const myShifts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const range = (req.query.range as string) || "upcoming";
  const now = new Date();

  const filter: any = { staffId: new Types.ObjectId(String(staffId)) };
  if (range === "past") {
    filter.status = { $in: ["completed", "cancelled", "missed"] };
  } else {
    filter.status = { $in: ["scheduled", "active"] };
    // Hide far-future scheduled shifts that the staff doesn't need to see
    // right now — beyond 14 days reads as roster planning, not "yours
    // today". Adjust the window when the product asks for it.
    filter.startAt = { $lte: new Date(now.getTime() + 14 * 24 * 3600 * 1000) };
  }

  const items = await Shift.find(filter)
    .sort({ startAt: range === "past" ? -1 : 1 })
    .limit(50)
    .populate("ambulanceId", "registrationNumber ambulanceType")
    .lean();

  req.rData = { items, total: items.length };
  req.msg = "my_shifts";
  next();
};

/**
 * Driver/attendant clock-in: marks the shift's clockInAt timestamp. Only
 * allowed within [startAt - CLOCK_IN_LEAD_MS, endAt]. Does NOT change the
 * shift's status — the state machine still owns that transition — but the
 * presence of clockInAt distinguishes "showed up" from "missed".
 */
export const clockIn = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const shift = await Shift.findOne({
    _id: (req.params.id as string),
    staffId,
  });
  if (!shift) {
    req.rCode = 5;
    req.msg = "shift_not_found";
    req.rData = {};
    return next();
  }
  if (shift.status !== "scheduled" && shift.status !== "active") {
    req.rCode = 0;
    req.msg = "shift_not_clockable";
    req.rData = { status: shift.status };
    return next();
  }

  const now = new Date();
  if (now.getTime() < shift.startAt.getTime() - CLOCK_IN_LEAD_MS) {
    req.rCode = 0;
    req.msg = "shift_too_early";
    req.rData = {
      hint: "You can clock in up to 15 minutes before the shift starts.",
    };
    return next();
  }
  if (now.getTime() > shift.endAt.getTime()) {
    req.rCode = 0;
    req.msg = "shift_already_ended";
    req.rData = {};
    return next();
  }

  if (!shift.clockInAt) {
    shift.clockInAt = now;
    await shift.save();
  }
  // Convenience: clocking in also flips the staff's general isDutyOn flag
  // so legacy "duty" displays light up without a separate tap.
  await AmbulanceStaff.updateOne(
    { _id: staffId },
    { isDutyOn: true, isOnline: true, lastSeenAt: now },
  );

  req.rData = { shift };
  req.msg = "clocked_in";
  next();
};

export const clockOut = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const shift = await Shift.findOne({
    _id: (req.params.id as string),
    staffId,
  });
  if (!shift) {
    req.rCode = 5;
    req.msg = "shift_not_found";
    req.rData = {};
    return next();
  }
  if (shift.status !== "active") {
    req.rCode = 0;
    req.msg = "shift_not_active";
    req.rData = { status: shift.status };
    return next();
  }

  shift.clockOutAt = new Date();
  shift.status = "completed";
  await shift.save();

  // Mirror state-machine behaviour: clear the ambulance cache if it
  // still holds this staff member.
  const field =
    shift.role === "driver" ? "assignedDriverId" : "assignedAttendantId";
  await Ambulance.updateOne(
    { _id: shift.ambulanceId, [field]: shift.staffId },
    { $set: { [field]: null } },
  );
  await AmbulanceStaff.updateOne(
    { _id: staffId },
    { isDutyOn: false, lastSeenAt: new Date() },
  );

  req.rData = { shift };
  req.msg = "clocked_out";
  next();
};

/**
 * Past trips for the current staff member. Used by the Bookings tab in
 * the driver/attendant shell to render trip history with status chips
 * and timestamps. Excludes the currently-active dispatch so the tab
 * doesn't double-count it alongside the "active" card.
 */
export const dispatchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "30", 10)),
  );
  const items = await EmergencyDispatch.find({
    $or: [{ driverStaffId: staffId }, { attendantStaffId: staffId }],
    status: { $in: ["COMPLETED", "CANCELLED"] },
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  req.rData = { items, total: items.length };
  req.msg = "dispatch_history";
  next();
};

/**
 * Paginated inbox for the signed-in staff member. Mirrors the patient
 * notification list endpoint — sorted newest-first, returns unreadCount
 * so the driver-app bell can render a badge.
 */
export const listNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    50,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const skip = (page - 1) * limit;
  const oid = new Types.ObjectId(String(staffId));

  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ staffId: oid })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ staffId: oid }),
    Notification.countDocuments({ staffId: oid, isRead: false }),
  ]);

  req.rData = {
    items,
    unreadCount,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "notifications";
  next();
};

/**
 * Mark a single notification belonging to this staff member as read.
 * The staffId filter prevents cross-account read-receipts.
 */
export const markNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const { id } = req.params as Record<string, string>;
  if (!Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json({ rCode: 0, rMsg: "invalid_id", rData: {} });
  }
  await Notification.updateOne(
    { _id: new Types.ObjectId(id), staffId },
    { isRead: true, readAt: new Date() },
  );
  req.rData = {};
  req.msg = "notification_read";
  next();
};

/** Mark every notification for this staff member as read. */
export const markAllNotificationsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  await Notification.updateMany(
    { staffId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  req.rData = {};
  req.msg = "notifications_all_read";
  next();
};

/**
 * GET /ambulance-staff/earnings — driver/attendant earnings summary.
 *
 * Earnings are derived on-the-fly from the staff member's COMPLETED
 * dispatches so there's no separate ledger to keep in sync. Per-trip payout =
 * basePerTrip + perKm × roadDistanceKm; when the staff member rode as the
 * attendant (not the driver) the payout is scaled by attendantSharePct.
 * Returns today / this-week / this-month / all-time totals plus a trip list.
 */
export const earnings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const sid = new Types.ObjectId(String(staffId));

  const completed = await EmergencyDispatch.find({
    status: "COMPLETED",
    $or: [{ driverStaffId: sid }, { attendantStaffId: sid }],
  })
    .sort({ completedAt: -1 })
    .lean();

  const { basePerTrip, perKm, attendantSharePct } = config.driverPayout;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  let total = 0;

  const trips = completed.map((d: any) => {
    const isDriver = String(d.driverStaffId) === String(sid);
    const km = d.roadDistanceKm || 0;
    let amount = basePerTrip + perKm * km;
    if (!isDriver) amount = (amount * attendantSharePct) / 100;
    amount = Math.round(amount * 100) / 100;

    const when = d.completedAt ? new Date(d.completedAt) : new Date(d.updatedAt);
    total += amount;
    if (when >= startOfMonth) thisMonth += amount;
    if (when >= startOfWeek) thisWeek += amount;
    if (when >= startOfDay) today += amount;

    return {
      dispatchId: d._id,
      serviceName: d.serviceName,
      role: isDriver ? "driver" : "attendant",
      distanceKm: km,
      amount,
      completedAt: when,
    };
  });

  const round = (n: number) => Math.round(n * 100) / 100;
  req.rData = {
    summary: {
      today: round(today),
      thisWeek: round(thisWeek),
      thisMonth: round(thisMonth),
      total: round(total),
      tripCount: trips.length,
    },
    rateCard: { basePerTrip, perKm, attendantSharePct },
    trips: trips.slice(0, 100),
  };
  req.msg = "success";
  next();
};
