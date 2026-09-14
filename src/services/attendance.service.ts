import { Types } from "mongoose";
import WorkShift, { IWorkShift } from "../models/work-shift.model";
import EmployeeShift from "../models/employee-shift.model";
import HrEmployee from "../models/hr-employee.model";
import Holiday from "../models/holiday.model";
import Attendance from "../models/attendance.model";
import GeofenceLocation from "../models/geofence-location.model";
import {
  computeDay,
  DayComputation,
  ShiftTiming,
} from "./working-hours";

/**
 * HR — attendance support: which shift a day was worked against, and the
 * hours that follow from it (§3 + §5).
 */

const ymd = (d: Date): string => {
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The shift that governs one employee on one day, most specific first:
 * the roster entry for that date, then the employee's default shift, then any
 * shift open to their department, then the General shift.
 *
 * Returns null when nothing matches — hours then stay uncomputed rather than
 * being measured against a shift the person does not actually work.
 */
export const resolveShiftFor = async (
  employeeId: Types.ObjectId | string,
  date: Date,
): Promise<(IWorkShift & { _id: Types.ObjectId }) | null> => {
  const assigned: any = await EmployeeShift.findOne({
    employeeId,
    date: ymd(date),
  })
    .populate("workShiftId")
    .lean();
  if (assigned?.workShiftId && typeof assigned.workShiftId === "object") {
    return assigned.workShiftId as any;
  }

  const emp: any = await HrEmployee.findById(employeeId)
    .select("defaultShiftId departmentId")
    .lean();
  if (emp?.defaultShiftId) {
    const s: any = await WorkShift.findById(emp.defaultShiftId).lean();
    if (s?.isActive) return s;
  }
  if (emp?.departmentId) {
    const s: any = await WorkShift.findOne({
      isActive: true,
      departmentIds: emp.departmentId,
    })
      .sort({ startTime: 1 })
      .lean();
    if (s) return s;
  }
  // A shift with no department list is open to everyone (the General shift).
  const fallback: any = await WorkShift.findOne({
    isActive: true,
    departmentIds: { $size: 0 },
  })
    .sort({ startTime: 1 })
    .lean();
  return fallback || null;
};

/** Hours, overtime and lateness for a day, or null if a punch is missing. */
export const applyDayComputation = (
  checkIn?: string | null,
  checkOut?: string | null,
  shift?: ShiftTiming | null,
): DayComputation | null => {
  if (!shift) return null;
  return computeDay(checkIn, checkOut, shift);
};

/**
 * Write the org's holidays into attendance for a month (§7).
 *
 * Holidays existed as a calendar that nothing consumed: payroll counted a
 * `holiday` row if one happened to exist, and nothing ever created one. They
 * were therefore paid only by the accident of being unmarked. This makes the
 * calendar real.
 *
 * Never overwrites a day that already carries a decision — someone marked
 * present on a holiday worked it, and someone on approved leave stays on
 * leave. Returns what it did so the caller can report it.
 */
export const applyHolidaysToAttendance = async (
  month: number,
  year: number,
  adminId?: Types.ObjectId | string,
): Promise<{ holidays: number; daysMarked: number }> => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  // Only holidays the organisation actually closes for write a day off into
  // attendance. A hospital keeps running on public holidays, so those are
  // marked `isWorkingDay` and handled the other way round: staff work them and
  // HR grants a compensatory off. Blanket-marking everyone "holiday" would
  // erase the fact that they worked and take the comp-off with it.
  const holidays = await Holiday.find({
    isActive: true,
    isWorkingDay: false,
    date: { $gte: start, $lte: end },
  })
    .select("date")
    .lean();
  if (holidays.length === 0) return { holidays: 0, daysMarked: 0 };

  const employees = await HrEmployee.find({
    isDeleted: false,
    status: { $in: ["active", "on_leave"] },
  })
    .select("_id joiningDate exitDate")
    .lean();

  const ops: any[] = [];
  for (const h of holidays) {
    const date = new Date(h.date);
    date.setHours(0, 0, 0, 0);
    for (const e of employees as any[]) {
      // Don't mark a holiday for someone not yet joined or already left.
      if (e.joiningDate && new Date(e.joiningDate) > date) continue;
      if (e.exitDate && new Date(e.exitDate) < date) continue;
      ops.push({
        updateOne: {
          filter: {
            employeeId: e._id,
            date,
            // Only fill a day that has no record at all. `upsert` with this
            // filter inserts when absent and matches nothing when present,
            // so an existing decision is never overwritten.
            status: { $exists: false },
          },
          update: {
            $setOnInsert: {
              subjectType: "hr_employee",
              employeeId: e._id,
              date,
              status: "holiday",
              markedByAdminId: adminId,
            },
          },
          upsert: true,
        },
      });
    }
  }

  let daysMarked = 0;
  if (ops.length) {
    // Duplicate-key errors are expected and benign here: they are exactly the
    // days that already had a record, which is the case we are declining to
    // touch. `ordered: false` lets the rest of the batch through.
    try {
      const res = await Attendance.bulkWrite(ops, { ordered: false });
      daysMarked = res.upsertedCount || 0;
    } catch (err: any) {
      daysMarked = err?.result?.upsertedCount ?? 0;
      const codes: number[] = (err?.writeErrors || []).map((w: any) => w.code);
      if (codes.some((c) => c !== 11000)) throw err;
    }
  }
  return { holidays: holidays.length, daysMarked };
};

/** Great-circle distance in metres. */
const distanceMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

export interface GeofenceVerdict {
  withinGeofence: boolean;
  distanceMeters: number;
  locationName: string;
  radiusMeters: number;
}

/**
 * Check a punch against the configured attendance locations (§4.2, §4.4).
 *
 * The nearest matching fence wins, so someone standing at one of several
 * centres is judged against the one they are actually at. A location with no
 * category list applies to everyone.
 *
 * Returns null when no fence is configured for this category — the caller
 * records the punch with the verdict unset. Geofencing is evidence for HR,
 * never a gate: staff legitimately start a shift from the field.
 */
export const evaluateGeofence = async (
  lat: number,
  lng: number,
  category?: string,
): Promise<GeofenceVerdict | null> => {
  const fences = await GeofenceLocation.find({
    isActive: true,
    ...(category
      ? { $or: [{ employeeCategories: category }, { employeeCategories: { $size: 0 } }] }
      : {}),
  }).lean();
  if (fences.length === 0) return null;

  let best: GeofenceVerdict | null = null;
  for (const f of fences) {
    const d = distanceMeters({ lat, lng }, { lat: f.lat, lng: f.lng });
    if (!best || d < best.distanceMeters) {
      best = {
        withinGeofence: d <= f.radiusMeters,
        distanceMeters: Math.round(d),
        locationName: f.name,
        radiusMeters: f.radiusMeters,
      };
    }
  }
  return best;
};
