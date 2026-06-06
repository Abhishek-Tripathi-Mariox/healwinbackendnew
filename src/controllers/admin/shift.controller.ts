import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Shift from "../../models/shift.model";
import Ambulance from "../../models/ambulance.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";

/**
 * Admin-facing shift CRUD. Replaces the old static-assignment endpoint —
 * admins now schedule windows of time instead of permanently binding a
 * paramedic to an ambulance.
 */

const validRoles = new Set(["driver", "attendant"]);

interface CreateBody {
  ambulanceId: string;
  staffId: string;
  role: "driver" | "attendant";
  startAt: string;
  endAt: string;
  notes?: string;
}

/**
 * Returns true if any non-terminal shift for `staffId` overlaps the window.
 * "Non-terminal" excludes completed / cancelled / missed shifts because
 * historical overlaps don't matter for a new booking.
 */
const hasStaffOverlap = async (
  staffId: Types.ObjectId,
  startAt: Date,
  endAt: Date,
  excludeShiftId?: Types.ObjectId,
) => {
  const query: any = {
    staffId,
    status: { $in: ["scheduled", "active"] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };
  if (excludeShiftId) query._id = { $ne: excludeShiftId };
  return Shift.exists(query);
};

/**
 * Returns true if `ambulanceId` already has a non-terminal shift for the
 * SAME role overlapping the window. (A driver shift and an attendant shift
 * may overlap on the same ambulance — that's the whole point.)
 */
const hasAmbulanceRoleOverlap = async (
  ambulanceId: Types.ObjectId,
  role: "driver" | "attendant",
  startAt: Date,
  endAt: Date,
  excludeShiftId?: Types.ObjectId,
) => {
  const query: any = {
    ambulanceId,
    role,
    status: { $in: ["scheduled", "active"] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };
  if (excludeShiftId) query._id = { $ne: excludeShiftId };
  return Shift.exists(query);
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const body = req.body as CreateBody;
  const { ambulanceId, staffId, role, startAt, endAt, notes } = body;

  // staffId is now optional — admin can roster an "open" shift (an
  // ambulance time-slot with no one assigned) and assign a paramedic
  // later via the assign endpoint. Ambulance + role + window are still
  // required.
  if (!ambulanceId || !role || !startAt || !endAt) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "ambulanceId, role, startAt, endAt are required",
    };
    return next();
  }
  if (!validRoles.has(role)) {
    req.rCode = 0;
    req.msg = "invalid_role";
    req.rData = {};
    return next();
  }

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    req.rCode = 0;
    req.msg = "invalid_dates";
    req.rData = {};
    return next();
  }
  if (end <= start) {
    req.rCode = 0;
    req.msg = "end_before_start";
    req.rData = {};
    return next();
  }

  const ambulance = await Ambulance.findById(ambulanceId);
  if (!ambulance || !ambulance.isActive) {
    req.rCode = 5;
    req.msg = "ambulance_not_found";
    req.rData = {};
    return next();
  }

  // Staff is optional — only validate if provided.
  let resolvedStaffId: Types.ObjectId | null = null;
  if (staffId) {
    const staff = await AmbulanceStaff.findById(staffId);
    if (!staff || !staff.isActive || staff.isDeleted) {
      req.rCode = 5;
      req.msg = "staff_not_found";
      req.rData = {};
      return next();
    }
    if (staff.role !== role) {
      req.rCode = 0;
      req.msg = "staff_role_mismatch";
      req.rData = { staffRole: staff.role, requestedRole: role };
      return next();
    }
    // Same-provider guard applies only to DRIVERS — see earlier comment.
    if (
      role === "driver" &&
      String(staff.providerId) !== String(ambulance.providerId)
    ) {
      req.rCode = 0;
      req.msg = "staff_provider_mismatch";
      req.rData = {};
      return next();
    }
    if (await hasStaffOverlap(staff._id, start, end)) {
      req.rCode = 0;
      res.status(409);
      req.msg = "staff_overlap";
      req.rData = {
        hint: "This staff member already has a shift during this window.",
      };
      return next();
    }
    resolvedStaffId = staff._id;
  }

  if (await hasAmbulanceRoleOverlap(ambulance._id, role, start, end)) {
    req.rCode = 0;
    res.status(409);
    req.msg = "ambulance_role_overlap";
    req.rData = {
      hint: `This ambulance already has a ${role} shift during this window.`,
    };
    return next();
  }

  const shift = await Shift.create({
    providerId: ambulance.providerId,
    ambulanceId: ambulance._id,
    staffId: resolvedStaffId,
    role,
    startAt: start,
    endAt: end,
    notes: notes || undefined,
    createdByAdminId: adminId,
    status: "scheduled",
  });

  req.rData = { shift };
  req.msg = "shift_created";
  next();
};

/**
 * Assign a staff member to an existing (open or already-assigned) shift.
 * Mirrors the create-time validation: role match, same-provider guard for
 * drivers only, and staff-overlap check. Used when admin first rosters
 * open slots and fills them later.
 */
export const assignStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { staffId } = (req.body || {}) as { staffId?: string };
  if (!staffId) {
    req.rCode = 0;
    req.msg = "staff_id_required";
    req.rData = {};
    return next();
  }
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  if (shift.status === "completed" || shift.status === "missed" || shift.status === "cancelled") {
    req.rCode = 0;
    req.msg = "shift_terminal";
    req.rData = { status: shift.status };
    return next();
  }
  const staff = await AmbulanceStaff.findById(staffId);
  if (!staff || !staff.isActive || staff.isDeleted) {
    req.rCode = 5;
    req.msg = "staff_not_found";
    req.rData = {};
    return next();
  }
  if (staff.role !== shift.role) {
    req.rCode = 0;
    req.msg = "staff_role_mismatch";
    req.rData = { staffRole: staff.role, requestedRole: shift.role };
    return next();
  }
  const ambulance = await Ambulance.findById(shift.ambulanceId);
  if (
    shift.role === "driver" &&
    ambulance &&
    String(staff.providerId) !== String(ambulance.providerId)
  ) {
    req.rCode = 0;
    req.msg = "staff_provider_mismatch";
    req.rData = {};
    return next();
  }
  if (await hasStaffOverlap(staff._id, shift.startAt, shift.endAt, shift._id)) {
    req.rCode = 0;
    res.status(409);
    req.msg = "staff_overlap";
    req.rData = {};
    return next();
  }
  shift.staffId = staff._id;
  await shift.save();
  req.rData = { shift };
  req.msg = "shift_assigned";
  next();
};

/** Clear the staff member from a shift, turning it back into an open slot. */
export const unassignStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  if (shift.status === "active") {
    // Can't yank an active shift's crew — admin should cancel instead.
    req.rCode = 0;
    req.msg = "shift_active";
    req.rData = {
      hint: "Cancel the shift to free the ambulance crew. Unassign is for scheduled slots.",
    };
    return next();
  }
  shift.staffId = null;
  await shift.save();
  req.rData = { shift };
  req.msg = "shift_unassigned";
  next();
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const {
    providerId,
    ambulanceId,
    staffId,
    hospitalId,
    role,
    status,
    fromDate,
    toDate,
    page = "1",
    limit = "50",
  } = req.query as Record<string, string | undefined>;
  const filter: any = {};
  if (providerId) filter.providerId = providerId;
  if (ambulanceId) filter.ambulanceId = ambulanceId;
  if (staffId) filter.staffId = staffId;
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (fromDate || toDate) {
    filter.startAt = {};
    if (fromDate) filter.startAt.$gte = new Date(fromDate);
    if (toDate) filter.startAt.$lte = new Date(toDate);
  }
  // hospitalId is a convenience filter for the Hospital Detail page —
  // resolve it to the staff IDs employed by that hospital and intersect
  // with any existing staffId filter. No matching staff → return an
  // empty result instead of "all shifts", which would be misleading.
  if (hospitalId) {
    const hospitalStaff = await AmbulanceStaff.find({
      hospitalId,
      isDeleted: false,
    })
      .select("_id")
      .lean();
    const ids = hospitalStaff.map((s) => s._id);
    if (ids.length === 0) {
      req.rData = { items: [], total: 0, page: 1, limit: 50 };
      req.msg = "shifts_listed";
      return next();
    }
    filter.staffId = filter.staffId
      ? // explicit staffId narrows the hospital set; require both to match
        { $in: ids.filter((id) => String(id) === String(filter.staffId)) }
      : { $in: ids };
  }

  const pg = Math.max(1, parseInt(page, 10));
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10)));

  const [items, total] = await Promise.all([
    Shift.find(filter)
      .sort({ startAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate("ambulanceId", "registrationNumber ambulanceType")
      .populate("staffId", "fullName mobileNumber role")
      .populate("providerId", "name")
      .lean(),
    Shift.countDocuments(filter),
  ]);

  req.rData = { items, total, page: pg, limit: lim };
  req.msg = "shifts_listed";
  next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const shift = await Shift.findById(req.params.id)
    .populate("ambulanceId")
    .populate("staffId")
    .populate("providerId", "name")
    .lean();
  if (!shift) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { shift };
  req.msg = "shift_detail";
  next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  if (shift.status === "completed" || shift.status === "missed") {
    req.rCode = 0;
    req.msg = "shift_terminal";
    req.rData = { hint: "Cannot edit a completed or missed shift." };
    return next();
  }

  const { startAt, endAt, notes } = req.body as {
    startAt?: string;
    endAt?: string;
    notes?: string;
  };

  const newStart = startAt ? new Date(startAt) : shift.startAt;
  const newEnd = endAt ? new Date(endAt) : shift.endAt;
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
    req.rCode = 0;
    req.msg = "invalid_dates";
    req.rData = {};
    return next();
  }
  if (newEnd <= newStart) {
    req.rCode = 0;
    req.msg = "end_before_start";
    req.rData = {};
    return next();
  }

  // Conflicts are only re-checked when the window changed.
  const windowChanged =
    newStart.getTime() !== shift.startAt.getTime() ||
    newEnd.getTime() !== shift.endAt.getTime();
  if (windowChanged) {
    // Skip the staff-overlap check on open (unassigned) shifts —
    // there's no person to double-book yet.
    if (
      shift.staffId &&
      (await hasStaffOverlap(shift.staffId, newStart, newEnd, shift._id))
    ) {
      req.rCode = 0;
      res.status(409);
      req.msg = "staff_overlap";
      req.rData = {};
      return next();
    }
    if (
      await hasAmbulanceRoleOverlap(
        shift.ambulanceId,
        shift.role,
        newStart,
        newEnd,
        shift._id,
      )
    ) {
      req.rCode = 0;
      res.status(409);
      req.msg = "ambulance_role_overlap";
      req.rData = {};
      return next();
    }
  }

  shift.startAt = newStart;
  shift.endAt = newEnd;
  if (notes !== undefined) shift.notes = notes;
  await shift.save();

  req.rData = { shift };
  req.msg = "shift_updated";
  next();
};

export const cancel = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  if (shift.status === "completed" || shift.status === "missed") {
    req.rCode = 0;
    req.msg = "shift_terminal";
    req.rData = {};
    return next();
  }
  shift.status = "cancelled";
  shift.cancelReason = (req.body?.reason as string) || undefined;
  await shift.save();

  // If we cancelled an active shift, clear the cache on the ambulance so
  // dispatch stops considering this crew. The state machine will also
  // re-evaluate on its next tick, but doing it inline avoids a window
  // where the cancelled crew remains "available".
  if (shift.status === "cancelled") {
    const field =
      shift.role === "driver" ? "assignedDriverId" : "assignedAttendantId";
    await Ambulance.updateOne(
      { _id: shift.ambulanceId, [field]: shift.staffId },
      { $set: { [field]: null } },
    );
  }

  req.rData = { shift };
  req.msg = "shift_cancelled";
  next();
};
