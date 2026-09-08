import { Request, Response, NextFunction } from "express";
import AttendanceRegularization from "../../models/attendance-regularization.model";
import Attendance from "../../models/attendance.model";
import HrEmployee from "../../models/hr-employee.model";
import { resolveShiftFor, applyDayComputation } from "../../services/attendance.service";
import { withTransaction } from "../../utils/txn.util";

/**
 * HR — Attendance Regularization (§4.5).
 *
 * Corrections to past attendance go through request → approve rather than a
 * direct edit, because attendance is what payroll is computed from: an
 * unrecorded change to a past day is an unrecorded change to someone's pay.
 */

const VALID_STATUS = [
  "present",
  "absent",
  "half_day",
  "leave",
  "holiday",
  "week_off",
];

const dayStart = (input: string | Date): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.employeeId) query.employeeId = req.query.employeeId;
  const items = await AttendanceRegularization.find(query)
    .sort({ createdAt: -1 })
    .limit(300)
    .populate("employeeId", "fullName employeeCode")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

/** POST /admin/hr/attendance/regularizations */
export const create = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.employeeId || !b.date || !b.toStatus) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "employeeId, date and toStatus are required" };
    return next();
  }
  if (!VALID_STATUS.includes(b.toStatus)) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: `toStatus must be one of: ${VALID_STATUS.join(", ")}` };
    return next();
  }
  const date = dayStart(b.date);
  if (date > new Date()) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "cannot regularize a date in the future" };
    return next();
  }
  const employee = await HrEmployee.findOne({
    _id: b.employeeId,
    isDeleted: false,
  }).lean();
  if (!employee) {
    req.rCode = 5; req.msg = "employee_not_found"; req.rData = {};
    return next();
  }
  const open = await AttendanceRegularization.findOne({
    employeeId: b.employeeId,
    date,
    status: "pending",
  }).lean();
  if (open) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "a regularization for this day is already pending" };
    return next();
  }

  // Snapshot what the day says now, so the approver sees what is changing.
  const existing = await Attendance.findOne({
    employeeId: b.employeeId,
    date,
    subjectType: "hr_employee",
  }).lean();

  const item = await AttendanceRegularization.create({
    employeeId: b.employeeId,
    date,
    reason: b.reason || "OTHER",
    note: b.note,
    fromStatus: existing?.status,
    fromCheckIn: existing?.checkIn,
    fromCheckOut: existing?.checkOut,
    toStatus: b.toStatus,
    toCheckIn: b.toCheckIn,
    toCheckOut: b.toCheckOut,
    status: "pending",
    requestedByAdminId: adminId,
  });
  req.rData = { item };
  req.msg = "saved";
  return next();
};

/** POST /admin/hr/attendance/regularizations/:id/approve */
export const approve = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const ar = await AttendanceRegularization.findById(req.params.id as string);
  if (!ar) {
    req.rCode = 5; req.msg = "not_found"; req.rData = {};
    return next();
  }
  if (ar.status !== "pending") {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: `already ${ar.status}` };
    return next();
  }

  const shift = await resolveShiftFor(ar.employeeId, ar.date);
  const computed = applyDayComputation(ar.toCheckIn, ar.toCheckOut, shift);

  await withTransaction(async (session) => {
    ar.status = "approved";
    ar.decidedByAdminId = adminId;
    ar.decisionNote = req.body?.decisionNote;
    ar.decidedAt = new Date();
    await ar.save({ session });

    await Attendance.updateOne(
      { employeeId: ar.employeeId, date: ar.date },
      {
        $set: {
          subjectType: "hr_employee",
          status: ar.toStatus,
          checkIn: ar.toCheckIn,
          checkOut: ar.toCheckOut,
          markedByAdminId: adminId,
          regularizationId: ar._id,
          shiftId: shift?._id,
          workedMinutes: computed?.workedMinutes || 0,
          overtimeMinutes: computed?.overtimeMinutes || 0,
          isLate: computed?.isLate || false,
        },
        // A corrected day is no longer a leave day.
        ...(ar.toStatus !== "leave" ? { $unset: { leaveRequestId: "" } } : {}),
      },
      { upsert: true, session },
    );
  });

  req.rData = { item: ar };
  req.msg = "saved";
  return next();
};

/** POST /admin/hr/attendance/regularizations/:id/reject */
export const reject = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const ar = await AttendanceRegularization.findById(req.params.id as string);
  if (!ar) {
    req.rCode = 5; req.msg = "not_found"; req.rData = {};
    return next();
  }
  if (ar.status !== "pending") {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: `already ${ar.status}` };
    return next();
  }
  ar.status = "rejected";
  ar.decidedByAdminId = adminId;
  ar.decisionNote = req.body?.decisionNote;
  ar.decidedAt = new Date();
  await ar.save();
  req.rData = { item: ar };
  req.msg = "saved";
  return next();
};
