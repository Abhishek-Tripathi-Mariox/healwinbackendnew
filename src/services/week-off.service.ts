import { Types } from "mongoose";

import HrEmployee from "../models/hr-employee.model";
import PayrollSettings from "../models/payroll-settings.model";
import EmployeeShift from "../models/employee-shift.model";
import Attendance from "../models/attendance.model";

/**
 * Week offs.
 *
 * A person's non-working days come from two places, and both have to agree:
 *   - a repeating pattern (every Sunday, plus the 2nd and 4th Saturday …),
 *     which is what HR actually thinks in; and
 *   - explicit roster entries, for the weeks where the pattern doesn't hold
 *     (someone swaps their off day, a ward runs a different rota).
 *
 * The pattern is stored once, not exploded into rows, so changing it fixes
 * every future week at once. Roster entries are the exception that wins.
 */

export interface WeekOffPattern {
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Which Saturdays of the month are off, e.g. [2, 4]. */
  saturdays: number[];
}

/** Which Saturday of its month a date is: the 1st, 2nd, … */
const saturdayOrdinal = (date: Date): number =>
  Math.floor((date.getDate() - 1) / 7) + 1;

/** "YYYY-MM-DD" in local time — the roster's date format. */
export const dateKey = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Every date from `from` to `to` inclusive, as local days. */
export const eachDay = (from: string, to: string): Date[] => {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const out: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
};

export const orgWeekOffPattern = async (): Promise<WeekOffPattern> => {
  const settings = await PayrollSettings.findOne().lean();
  return {
    days: settings?.defaultWeekOffDays ?? [0],
    saturdays: settings?.defaultWeekOffSaturdays ?? [],
  };
};

/**
 * The pattern that applies to one employee: their own if they have one, the
 * organisation's otherwise. An employee with an empty list has never been
 * given a personal pattern — that is different from "works every day", which
 * is not expressible and, so far, not asked for.
 */
export const patternFor = (
  employee: { weekOffDays?: number[]; weekOffSaturdays?: number[] },
  org: WeekOffPattern,
): WeekOffPattern => ({
  days: employee.weekOffDays?.length ? employee.weekOffDays : org.days,
  saturdays: employee.weekOffSaturdays?.length
    ? employee.weekOffSaturdays
    : org.saturdays,
});

/** Does this date fall on the pattern's week off? */
export const isWeekOff = (date: Date, pattern: WeekOffPattern): boolean => {
  if (pattern.days.includes(date.getDay())) return true;
  // The nth-Saturday rule only adds days; it never takes one away.
  return (
    date.getDay() === 6 && pattern.saturdays.includes(saturdayOrdinal(date))
  );
};

/**
 * Write the month's week offs into attendance, the same way holidays are
 * written (see `applyHolidaysToAttendance`): fill only the days that carry no
 * decision yet, so a day someone actually worked, or was on leave, is left
 * exactly as it is.
 *
 * Both sources are honoured — the employee's pattern, and any day the roster
 * explicitly marks `week_off`, which is how an exception to the pattern is
 * recorded.
 */
export const applyWeekOffsToAttendance = async (
  month: number,
  year: number,
  adminId?: Types.ObjectId | string,
): Promise<{ employees: number; daysMarked: number }> => {
  const first = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const last = new Date(year, month, 0, 0, 0, 0, 0);

  const employees = await HrEmployee.find({
    isDeleted: false,
    status: { $in: ["active", "on_leave"] },
  })
    .select("_id joiningDate exitDate weekOffDays weekOffSaturdays")
    .lean();
  if (employees.length === 0) return { employees: 0, daysMarked: 0 };

  const org = await orgWeekOffPattern();

  // Roster exceptions for the month, keyed by employee + date.
  const rosterOffs = await EmployeeShift.find({
    shift: "week_off",
    date: { $gte: dateKey(first), $lte: dateKey(last) },
  })
    .select("employeeId date")
    .lean();
  const rosterKeys = new Set(
    rosterOffs.map((r: any) => `${String(r.employeeId)}|${r.date}`),
  );
  // A day the roster gives a real shift to is a working day even if the
  // pattern says otherwise — that is the point of rostering someone on their
  // usual off day.
  const rosterWorking = await EmployeeShift.find({
    shift: { $ne: "week_off" },
    date: { $gte: dateKey(first), $lte: dateKey(last) },
  })
    .select("employeeId date")
    .lean();
  const workingKeys = new Set(
    rosterWorking.map((r: any) => `${String(r.employeeId)}|${r.date}`),
  );

  const days = eachDay(dateKey(first), dateKey(last));
  const ops: any[] = [];

  for (const e of employees as any[]) {
    const pattern = patternFor(e, org);
    for (const day of days) {
      const key = `${String(e._id)}|${dateKey(day)}`;
      if (workingKeys.has(key)) continue;
      if (!rosterKeys.has(key) && !isWeekOff(day, pattern)) continue;
      // Not yet joined, or already left.
      if (e.joiningDate && new Date(e.joiningDate) > day) continue;
      if (e.exitDate && new Date(e.exitDate) < day) continue;

      const date = new Date(day);
      date.setHours(0, 0, 0, 0);
      ops.push({
        updateOne: {
          // Only fill a day with no record at all: `upsert` with this filter
          // inserts when absent and matches nothing when a decision exists.
          filter: { employeeId: e._id, date, status: { $exists: false } },
          update: {
            $setOnInsert: {
              subjectType: "hr_employee",
              employeeId: e._id,
              date,
              status: "week_off",
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
    // Duplicate keys are the days that already had a record — exactly the ones
    // we are declining to touch. `ordered: false` lets the rest through.
    try {
      const res = await Attendance.bulkWrite(ops, { ordered: false });
      daysMarked = res.upsertedCount || 0;
    } catch (err: any) {
      daysMarked = err?.result?.upsertedCount ?? 0;
      const codes: number[] = (err?.writeErrors || []).map((w: any) => w.code);
      if (codes.some((c) => c !== 11000)) throw err;
    }
  }

  return { employees: employees.length, daysMarked };
};

export default {
  applyWeekOffsToAttendance,
  isWeekOff,
  patternFor,
  orgWeekOffPattern,
  eachDay,
  dateKey,
};
