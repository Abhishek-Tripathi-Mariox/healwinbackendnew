import { Request, Response, NextFunction } from "express";
import Attendance, { AttendanceStatus } from "../../models/attendance.model";
import HrEmployee from "../../models/hr-employee.model";
import {
  buildAttendanceSummary,
  daysInMonth,
} from "../../services/payroll.service";
import {
  resolveShiftFor,
  applyDayComputation,
  applyHolidaysToAttendance,
} from "../../services/attendance.service";
import { formatDuration } from "../../services/working-hours";
import { getCycleStartDay } from "../../services/payroll-settings.service";
import { payrollPeriod } from "../../services/payroll-period";

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

  // Scope to HR employees — ambulance crew mark their own attendance against
  // ambulanceStaffId and would otherwise be pulled into this roster's map.
  const records = await Attendance.find({
    date,
    subjectType: "hr_employee",
  }).lean();
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
    employeeId: (req.params.id as string),
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1 })
    .lean();

  // Use the same employment window payroll uses, so what HR reads here and
  // what the payslip is computed from cannot drift apart.
  const emp = await HrEmployee.findById(req.params.id as string)
    .select("joiningDate exitDate")
    .lean();
  const summary = await buildAttendanceSummary(
    String(req.params.id),
    month,
    year,
    new Set(),
    "hr_employee",
    { joiningDate: emp?.joiningDate, exitDate: emp?.exitDate },
    await getCycleStartDay(),
  );

  req.rData = {
    month,
    year,
    records,
    summary: {
      ...summary,
      workedLabel: formatDuration(summary.workedMinutes),
      overtimeLabel: formatDuration(summary.overtimeMinutes),
    },
  };
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

  // Resolve each employee's shift once for the day, then compute hours from
  // the punches (§5). Without a shift we still record the punches but leave
  // hours at zero rather than measuring against a shift they don't work.
  const uniqueIds: string[] = [
    ...new Set(
      entries
        .filter((en: any) => en.employeeId && VALID.includes(en.status))
        .map((en: any) => String(en.employeeId)) as string[],
    ),
  ];
  const shiftByEmployee = new Map<string, any>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      shiftByEmployee.set(id, await resolveShiftFor(id, date));
    }),
  );

  const ops = [];
  const missedPunches: string[] = [];
  for (const en of entries) {
    if (!en.employeeId || !VALID.includes(en.status)) continue;
    const shift = shiftByEmployee.get(String(en.employeeId));
    const computed = applyDayComputation(en.checkIn, en.checkOut, shift);
    // One punch but not the other: record it, but say so — that day needs a
    // regularization, not a silent zero.
    if (!computed && (en.checkIn || en.checkOut)) {
      missedPunches.push(String(en.employeeId));
    }
    const update: any = {
      $set: {
        status: en.status,
        remarks: en.remarks,
        checkIn: en.checkIn,
        checkOut: en.checkOut,
        markedByAdminId: adminId,
        shiftId: shift?._id,
        workedMinutes: computed?.workedMinutes || 0,
        overtimeMinutes: computed?.overtimeMinutes || 0,
        isLate: computed?.isLate || false,
      },
    };
    // Re-marking a leave day as present/absent detaches it from the leave
    // request, so a later cancellation of that leave doesn't delete this
    // correction along with the rows it actually created.
    if (en.status !== "leave") update.$unset = { leaveRequestId: "" };
    ops.push({
      updateOne: {
        filter: { employeeId: en.employeeId, date },
        update,
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
  req.rData = { count: ops.length, date, missedPunches };
  req.msg = "attendance_marked";
  return next();
};

/**
 * POST /admin/hr/attendance/apply-holidays  body: { month, year }
 *
 * Fills the month's holidays into attendance for every employee on the rolls,
 * skipping days that already carry a decision (§7).
 */
export const applyHolidays = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const month = parseInt(req.body?.month, 10);
  const year = parseInt(req.body?.year, 10);
  if (!(month >= 1 && month <= 12) || !year) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "valid month (1-12) and year are required" };
    return next();
  }
  const result = await applyHolidaysToAttendance(month, year, adminId);
  req.rData = result;
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
    .select("fullName employeeCode joiningDate exitDate")
    .sort({ fullName: 1 })
    .lean();

  const cycleStartDay = await getCycleStartDay();
  const rows = await Promise.all(
    employees.map(async (e) => ({
      employee: e,
      summary: await buildAttendanceSummary(
        e._id,
        month,
        year,
        new Set(),
        "hr_employee",
        { joiningDate: e.joiningDate, exitDate: e.exitDate },
        cycleStartDay,
      ),
    })),
  );

  req.rData = {
    month,
    year,
    // So the screen can say which days these numbers actually cover.
    period: payrollPeriod(month, year, cycleStartDay).label,
    rows,
  };
  req.msg = "attendance_summary";
  return next();
};
