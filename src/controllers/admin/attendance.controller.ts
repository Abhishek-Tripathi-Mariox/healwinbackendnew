import { Request, Response, NextFunction } from "express";
import Attendance, { AttendanceStatus } from "../../models/attendance.model";
import HrEmployee from "../../models/hr-employee.model";
import {
  buildAttendanceSummary,
  daysInMonth,
} from "../../services/payroll.service";

/**
 * HR — Attendance. Marking is idempotent via upsert on {employeeId, date}.
 */

const VALID: AttendanceStatus[] = [
  "present",
  "absent",
  "half_day",
  "leave",
  "holiday",
  "week_off",
];

/** Normalize an incoming date string to local midnight. */
const dayStart = (input: string | Date): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** GET /admin/hr/attendance?date=YYYY-MM-DD — roster of all active employees for a day. */
export const byDate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const date = dayStart((req.query.date as string) || new Date().toISOString());

  const employees = await HrEmployee.find({
    isDeleted: false,
    status: { $ne: "terminated" },
  })
    .select("fullName employeeCode departmentId designationId")
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .sort({ fullName: 1 })
    .lean();

  const records = await Attendance.find({ date }).lean();
  const byEmp = new Map(records.map((r) => [String(r.employeeId), r]));

  const roster = employees.map((e) => ({
    employee: e,
    attendance: byEmp.get(String(e._id)) || null,
  }));

  req.rData = { date, roster };
  req.msg = "attendance_list";
  return next();
};

/** GET /admin/hr/attendance/employee/:id?month=&year= — one employee's month. */
export const byEmployeeMonth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const month = parseInt(
    (req.query.month as string) || String(new Date().getMonth() + 1),
    10,
  );
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );
  const total = daysInMonth(month, year);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month - 1, total, 23, 59, 59, 999);

  const records = await Attendance.find({
    employeeId: req.params.id,
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1 })
    .lean();

  const summary = await buildAttendanceSummary(
    String(req.params.id),
    month,
    year,
  );

  req.rData = { month, year, records, summary };
  req.msg = "attendance_list";
  return next();
};

/**
 * POST /admin/hr/attendance/mark
 * body: { date, entries: [{ employeeId, status, remarks? }] }
 * Upserts each entry idempotently.
 */
export const markBulk = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const date = b.date ? dayStart(b.date) : null;
  const entries = Array.isArray(b.entries) ? b.entries : [];

  if (!date || entries.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "date and a non-empty entries array are required" };
    return next();
  }

  const ops = [];
  for (const en of entries) {
    if (!en.employeeId || !VALID.includes(en.status)) continue;
    ops.push({
      updateOne: {
        filter: { employeeId: en.employeeId, date },
        update: {
          $set: {
            status: en.status,
            remarks: en.remarks,
            checkIn: en.checkIn,
            checkOut: en.checkOut,
            markedByAdminId: adminId,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "no valid entries (check status values)" };
    return next();
  }

  await Attendance.bulkWrite(ops);
  req.rData = { count: ops.length, date };
  req.msg = "attendance_marked";
  return next();
};

/**
 * GET /admin/hr/attendance/summary?month=&year= — per-employee monthly rollup.
 */
export const monthlySummary = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const month = parseInt(
    (req.query.month as string) || String(new Date().getMonth() + 1),
    10,
  );
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );

  const employees = await HrEmployee.find({
    isDeleted: false,
    status: { $ne: "terminated" },
  })
    .select("fullName employeeCode")
    .sort({ fullName: 1 })
    .lean();

  const rows = await Promise.all(
    employees.map(async (e) => ({
      employee: e,
      summary: await buildAttendanceSummary(e._id, month, year),
    })),
  );

  req.rData = { month, year, rows };
  req.msg = "attendance_summary";
  return next();
};
