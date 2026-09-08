import { Request, Response, NextFunction } from "express";
import WorkShift from "../../models/work-shift.model";
import EmployeeShift from "../../models/employee-shift.model";
import HrEmployee from "../../models/hr-employee.model";
import { parseHHmm, shiftLengthMinutes } from "../../services/working-hours";

/**
 * HR — Shift master (§3). Defines the shifts themselves; EmployeeShift only
 * says who works which one on which day.
 */

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const validate = (b: any): string | null => {
  if (!b.name || !String(b.name).trim()) return "name is required";
  if (!b.code || !String(b.code).trim()) return "code is required";
  if (!HHMM.test(String(b.startTime || "")))
    return "startTime must be HH:mm (24-hour)";
  if (!HHMM.test(String(b.endTime || "")))
    return "endTime must be HH:mm (24-hour)";
  if (parseHHmm(b.startTime) === parseHHmm(b.endTime))
    return "startTime and endTime cannot be the same";
  const nums: [string, any][] = [
    ["breakMinutes", b.breakMinutes],
    ["graceMinutes", b.graceMinutes],
    ["fullDayMinutes", b.fullDayMinutes],
    ["halfDayMinutes", b.halfDayMinutes],
    ["overtimeAfterMinutes", b.overtimeAfterMinutes],
  ];
  for (const [k, v] of nums) {
    if (v !== undefined && (!Number.isFinite(Number(v)) || Number(v) < 0))
      return `${k} must be a non-negative number`;
  }
  if (
    b.halfDayMinutes !== undefined &&
    b.fullDayMinutes !== undefined &&
    Number(b.halfDayMinutes) > Number(b.fullDayMinutes)
  ) {
    return "halfDayMinutes cannot exceed fullDayMinutes";
  }
  return null;
};

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.active === "true") query.isActive = true;
  if (req.query.departmentId) {
    // A shift with no departments is open to all, so it must still appear.
    query.$or = [
      { departmentIds: req.query.departmentId },
      { departmentIds: { $size: 0 } },
    ];
  }
  const items = await WorkShift.find(query)
    .sort({ startTime: 1 })
    .populate("departmentIds", "name")
    .lean();
  req.rData = {
    items: items.map((s: any) => ({
      ...s,
      lengthMinutes: shiftLengthMinutes(s),
      isOvernight: (parseHHmm(s.endTime) ?? 0) <= (parseHHmm(s.startTime) ?? 0),
    })),
  };
  req.msg = "success";
  return next();
};

export const save = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const err = validate(b);
  if (err) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: err };
    return next();
  }
  const payload: any = {
    name: String(b.name).trim(),
    code: String(b.code).trim().toUpperCase(),
    startTime: b.startTime,
    endTime: b.endTime,
    breakMinutes: Number(b.breakMinutes) || 0,
    departmentIds: Array.isArray(b.departmentIds) ? b.departmentIds : [],
    graceMinutes: Number(b.graceMinutes) || 0,
    fullDayMinutes: Number(b.fullDayMinutes) || 480,
    halfDayMinutes: Number(b.halfDayMinutes) || 240,
    overtimeAfterMinutes: Number(b.overtimeAfterMinutes) || 0,
    isActive: b.isActive !== false,
  };

  const id = req.params.id as string;
  // The unique code is what makes a duplicate cheap to catch — report it as a
  // validation error rather than letting E11000 surface as a 500.
  const clash = await WorkShift.findOne({
    code: payload.code,
    ...(id ? { _id: { $ne: id } } : {}),
  }).lean();
  if (clash) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `shift code ${payload.code} already exists` };
    return next();
  }

  const item = id
    ? await WorkShift.findByIdAndUpdate(id, payload, { new: true })
    : await WorkShift.create(payload);
  req.rData = { item };
  req.msg = "saved";
  return next();
};

export const remove = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const id = req.params.id as string;
  // Deleting a shift that days were worked against would orphan the timings
  // those days' hours were computed from. Deactivate instead.
  const [assigned, defaulted] = await Promise.all([
    EmployeeShift.countDocuments({ workShiftId: id }),
    HrEmployee.countDocuments({ defaultShiftId: id, isDeleted: false }),
  ]);
  if (assigned > 0 || defaulted > 0) {
    await WorkShift.findByIdAndUpdate(id, { isActive: false });
    req.rData = { deactivated: true, assigned, defaulted };
    req.msg = "shift_deactivated";
    return next();
  }
  await WorkShift.findByIdAndDelete(id);
  req.rData = { deleted: true };
  req.msg = "deleted";
  return next();
};
