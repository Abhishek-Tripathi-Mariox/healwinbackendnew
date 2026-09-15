import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import {
  resolveShiftFor,
  applyDayComputation,
  evaluateGeofence,
} from "../../services/attendance.service";
import { formatDuration } from "../../services/working-hours";
import { buildAttendanceSummary } from "../../services/payroll.service";
import { getCycleStartDay } from "../../services/payroll-settings.service";
import { payrollPeriod, periodForDate } from "../../services/payroll-period";
import { uploadFileToAws } from "../../utils/s3";

/**
 * Self-service attendance — an employee punching their own day.
 *
 * Until now attendance for HR staff could only be entered by an admin, in bulk,
 * after the fact. That makes the record a reconstruction rather than a
 * measurement: nobody remembers on the 30th who came in late on the 4th.
 * Punching writes the same Attendance row HR and payroll already read, so it
 * feeds the dashboard and the payslip without a separate pipeline.
 *
 * The person is resolved from their panel login, never from the request body —
 * otherwise anyone could punch in as anyone else.
 */

const dayStart = (input?: Date | string): Date => {
  const d = input ? new Date(input) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** "HH:mm" in the server's local zone, which is pinned to IST in deployment. */
const hhmm = (d = new Date()): string => d.toTimeString().slice(0, 5);

/** The employee behind the signed-in panel user. */
const meFrom = async (req: Request) => {
  const adminId = (req as any).adminId;
  if (!adminId) return null;
  return HrEmployee.findOne({ linkedAdminId: adminId, isDeleted: false })
    .populate("departmentId", "name")
    .populate("designationId", "name");
};

const notLinked = (req: Request, next: NextFunction) => {
  req.rCode = 0;
  req.msg = "validation_failed";
  req.rData = {
    hint: "Your login is not linked to an employee record, so attendance cannot be recorded against it. Ask HR to link it under Employees.",
    linked: false,
  };
  return next();
};

/**
 * GET /admin/hr/my-attendance?month=&year=
 *
 * Today's state plus the period's rows and totals — everything the employee's
 * own screen shows.
 */
export const mine = async (req: Request, _res: Response, next: NextFunction) => {
  const employee: any = await meFrom(req);
  if (!employee) return notLinked(req, next);

  const cycleStartDay = await getCycleStartDay();
  /**
   * Default to the period that CONTAINS today, not to the calendar month.
   *
   * On a 16th-to-15th cycle those are different things for half the month: on
   * 15 September the current period began on 16 August, so defaulting to
   * "September" would open the screen on a period that has not started and
   * show the employee an empty list with today's own punch missing from it.
   */
  const current = periodForDate(new Date(), cycleStartDay);
  const month = Number(req.query.month) || current.month;
  const year = Number(req.query.year) || current.year;

  const period = payrollPeriod(month, year, cycleStartDay);

  const [today, rows, summary, shift] = await Promise.all([
    Attendance.findOne({ employeeId: employee._id, date: dayStart() }).lean(),
    Attendance.find({
      employeeId: employee._id,
      date: { $gte: period.start, $lte: period.end },
    })
      .sort({ date: -1 })
      .lean(),
    buildAttendanceSummary(
      employee._id,
      month,
      year,
      new Set(),
      "hr_employee",
      { joiningDate: employee.joiningDate, exitDate: employee.exitDate },
      cycleStartDay,
    ),
    resolveShiftFor(employee._id, dayStart()),
  ]);

  req.rData = {
    linked: true,
    employee: {
      _id: employee._id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.departmentId?.name,
      designation: employee.designationId?.name,
    },
    shift: shift
      ? { name: (shift as any).name, startTime: (shift as any).startTime, endTime: (shift as any).endTime }
      : null,
    today: today || null,
    // What the button should offer next, so the screen does not have to infer
    // it from a half-filled row.
    canPunchIn: !(today as any)?.checkIn,
    canPunchOut: !!(today as any)?.checkIn && !(today as any)?.checkOut,
    period: { month, year, label: period.label },
    rows: (rows as any[]).map((r) => ({
      ...r,
      workedLabel: formatDuration(r.workedMinutes),
      overtimeLabel: formatDuration(r.overtimeMinutes),
    })),
    summary: {
      ...summary,
      workedLabel: formatDuration(summary.workedMinutes),
      overtimeLabel: formatDuration(summary.overtimeMinutes),
    },
  };
  req.msg = "success";
  return next();
};

/**
 * POST /admin/hr/my-attendance/punch  body: { type: "in" | "out", lat?, lng? }
 *
 * Accepts an optional selfie as `photo` (multipart).
 */
export const punch = async (req: Request, _res: Response, next: NextFunction) => {
  const employee: any = await meFrom(req);
  if (!employee) return notLinked(req, next);

  const type = String(req.body?.type || "").toLowerCase();
  if (type !== "in" && type !== "out") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: 'type must be "in" or "out"' };
    return next();
  }

  const date = dayStart();
  const existing: any = await Attendance.findOne({
    employeeId: employee._id,
    date,
  });

  if (type === "in" && existing?.checkIn) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `You already punched in at ${existing.checkIn}. Ask HR to correct it if that is wrong.`,
      today: existing,
    };
    return next();
  }
  if (type === "out" && !existing?.checkIn) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Punch in first — there is no check-in to close." };
    return next();
  }
  if (type === "out" && existing?.checkOut) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `You already punched out at ${existing.checkOut}.`,
      today: existing,
    };
    return next();
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  /**
   * Location is recorded, never enforced.
   *
   * A punch is how someone is paid for the day. Refusing it because a phone's
   * GPS drifted, or because nobody has configured a fence for that building
   * yet, means marking a person absent for a fault that is not theirs. HR sees
   * the distance and the flag on the row and can act on a real pattern.
   */
  let withinGeofence: boolean | undefined;
  let distanceMeters: number | undefined;
  if (hasLocation) {
    const verdict = await evaluateGeofence(lat, lng, employee.category);
    if (verdict) {
      withinGeofence = verdict.withinGeofence;
      distanceMeters = verdict.distanceMeters;
    }
  }

  let photoUrl: string | undefined;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (file) {
    try {
      const { images } = await uploadFileToAws([file]);
      photoUrl = images as unknown as string;
    } catch {
      // A failed upload must not cost someone their attendance for the day.
    }
  }

  const time = hhmm();
  const shift = await resolveShiftFor(employee._id, date);

  const checkIn = type === "in" ? time : existing?.checkIn;
  const checkOut = type === "out" ? time : existing?.checkOut;
  // Hours are computed against the shift they actually work; with no shift
  // assigned the punches are still recorded and hours stay at zero rather than
  // being measured against a shift they do not have.
  const computed = applyDayComputation(checkIn, checkOut, shift);

  const set: any = {
    subjectType: "hr_employee",
    status: "present",
    checkIn,
    ...(checkOut ? { checkOut } : {}),
    shiftId: (shift as any)?._id,
    workedMinutes: computed?.workedMinutes || 0,
    overtimeMinutes: computed?.overtimeMinutes || 0,
    isLate: computed?.isLate || false,
  };
  if (type === "in") {
    if (photoUrl) set.checkInPhoto = photoUrl;
    if (hasLocation) set.checkInLocation = { lat, lng };
    if (withinGeofence !== undefined) set.checkInWithinGeofence = withinGeofence;
  }

  const saved = await Attendance.findOneAndUpdate(
    { employeeId: employee._id, date },
    { $set: set },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  req.rData = {
    today: saved,
    punchedAt: time,
    type,
    ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    ...(withinGeofence === false
      ? {
          warning:
            "Recorded, but you appear to be away from a registered work location. HR will see this on your attendance.",
        }
      : {}),
    workedLabel: formatDuration(computed?.workedMinutes || 0),
  };
  req.msg = "saved";
  return next();
};
