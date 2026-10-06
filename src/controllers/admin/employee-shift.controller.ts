import { Request, Response, NextFunction } from "express";
import EmployeeShift from "../../models/employee-shift.model";
import HrEmployee from "../../models/hr-employee.model";
import { Types } from "mongoose";
import { paginate } from "../../utils/paginate.util";
import {
  dateKey,
  eachDay,
  isWeekOff,
  orgWeekOffPattern,
  patternFor,
} from "../../services/week-off.service";

/** Admin: hospital/HR staff shift scheduling. */
const SHIFTS = new Set(["morning", "evening", "night", "general", "week_off"]);

/** How many employee-days one bulk assignment may write. */
const MAX_BULK_ROWS = 20000;

/**
 * Employee ids matching a department/designation filter.
 *
 * Department and designation live on the employee, not on the shift row, so
 * narrowing the roster by them means resolving the people first. Returns null
 * when neither filter is set, which means "no employee restriction" — distinct
 * from an empty list, which means "no one matches" and must return nothing.
 */
const employeeIdsMatching = async (
  req: Request,
): Promise<Types.ObjectId[] | null> => {
  const departmentId = req.query.departmentId as string | undefined;
  const designationId = req.query.designationId as string | undefined;
  if (!departmentId && !designationId) return null;

  const q: any = { isDeleted: false };
  if (departmentId) {
    // "none" is how the caller asks for staff with no department set.
    q.departmentId = departmentId === "none" ? null : departmentId;
  }
  if (designationId) {
    // Repeated ?designationId= (or a comma list) narrows to several roles at
    // once — "roster the guards and housekeeping together" is one action.
    const ids = String(designationId).split(",").filter(Boolean);
    q.designationId =
      ids.length > 1
        ? { $in: ids.map((id) => (id === "none" ? null : id)) }
        : ids[0] === "none"
          ? null
          : ids[0];
  }
  const rows = await HrEmployee.find(q).select("_id").lean();
  return rows.map((r: any) => r._id);
};

// GET /?date=&dateTo=&departmentId=&designationId=&employeeId=
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};

  // A single day, or a range when `dateTo` is given — the roster is usually
  // read a week at a time, and a one-day-at-a-time view hides the pattern.
  if (req.query.date && req.query.dateTo) {
    query.date = { $gte: req.query.date, $lte: req.query.dateTo };
  } else if (req.query.date) {
    query.date = req.query.date;
  }

  if (req.query.employeeId) {
    query.employeeId = req.query.employeeId;
  } else {
    const ids = await employeeIdsMatching(req);
    if (ids !== null) query.employeeId = { $in: ids };
  }
  if (req.query.shift) query.shift = req.query.shift;

  const { items, pagination } = await paginate(
    EmployeeShift,
    query,
    req,
    { date: 1, shift: 1 },
    [
      {
        path: "employeeId",
        select: "fullName employeeCode departmentId designationId",
        populate: [
          { path: "departmentId", select: "name" },
          { path: "designationId", select: "name" },
        ],
      },
    ],
  );
  req.rData = { items, pagination };
  req.msg = "success";
  return next();
};

// GET /employees?departmentId=&designationId= — picker for the schedule form,
// narrowed by the same filters as the roster so the two agree.
export const employees = async (req: Request, _res: Response, next: NextFunction) => {
  const q: any = { isDeleted: false, status: { $ne: "terminated" } };
  if (req.query.departmentId) {
    q.departmentId =
      req.query.departmentId === "none" ? null : req.query.departmentId;
  }
  if (req.query.designationId) {
    // Same comma-list form the roster takes, so the picker and the list can be
    // narrowed by exactly the same selection.
    const ids = String(req.query.designationId).split(",").filter(Boolean);
    q.designationId =
      ids.length > 1
        ? { $in: ids.map((id) => (id === "none" ? null : id)) }
        : ids[0] === "none"
          ? null
          : ids[0];
  }
  const items = await HrEmployee.find(q)
    .select("fullName employeeCode departmentId designationId")
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .sort({ fullName: 1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

// POST / — assign a shift (upsert on employee+date+shift to avoid duplicates).
export const create = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.employeeId || !b.date || !SHIFTS.has(b.shift)) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "employeeId, date (YYYY-MM-DD) and shift required" };
    return next();
  }
  const item = await EmployeeShift.findOneAndUpdate(
    { employeeId: b.employeeId, date: b.date, shift: b.shift },
    { $set: { startTime: b.startTime, endTime: b.endTime, department: b.department, section: b.section, notes: b.notes } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  req.rData = { item };
  req.msg = "saved";
  return next();
};

// DELETE /:id
export const remove = async (req: Request, _res: Response, next: NextFunction) => {
  await EmployeeShift.findByIdAndDelete(req.params.id as string);
  req.rData = {};
  req.msg = "deleted";
  return next();
};

/**
 * Who a bulk action applies to: an explicit list of people, or everyone
 * matching a department / set of designations. Returns a string when the
 * selection is unusable, so both callers refuse it the same way.
 */
const resolveTargets = async (
  b: any,
): Promise<{ employees: any[] } | { error: string }> => {
  const explicitIds: string[] = Array.isArray(b.employeeIds)
    ? b.employeeIds.filter(Boolean).map(String)
    : [];
  const designationIds: string[] = Array.isArray(b.designationIds)
    ? b.designationIds.filter(Boolean).map(String)
    : [];

  const q: any = { isDeleted: false, status: { $ne: "terminated" } };
  if (explicitIds.length) {
    q._id = { $in: explicitIds.map((id) => new Types.ObjectId(id)) };
  } else if (b.departmentId || designationIds.length) {
    if (b.departmentId) {
      q.departmentId = b.departmentId === "none" ? null : b.departmentId;
    }
    if (designationIds.length) {
      q.designationId = {
        $in: designationIds.map((id) =>
          id === "none" ? null : new Types.ObjectId(id),
        ),
      };
    }
  } else {
    // Acting on literally everyone is almost always a mis-click, and it is the
    // one mistake here that is tedious to undo.
    return {
      error: "select employees, or a department / designation to act on",
    };
  }

  const employees = await HrEmployee.find(q)
    .select("_id fullName joiningDate exitDate weekOffDays weekOffSaturdays")
    .lean();
  if (employees.length === 0) {
    return { error: "no employees match this selection" };
  }
  return { employees };
};

/**
 * POST /bulk — roster many people over a date range in one go.
 *
 * The per-day, per-person form was the whole scheduling story, which made a
 * month's roster for a ward hundreds of clicks. Targets are either an explicit
 * list of employees, or everyone matching a department / set of designations.
 *
 * `skipWeekOffs` leaves each person's own off days alone, so a range can just
 * be "the whole month" without rostering people through their weekend.
 */
export const bulkAssign = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const shift = String(b.shift || "");
  const from = String(b.from || "");
  const to = String(b.to || from);

  const fail = (hint: string) => {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint };
    return next();
  };

  if (!SHIFTS.has(shift)) {
    return fail(`shift must be one of: ${[...SHIFTS].join(", ")}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("from and to must be dates (YYYY-MM-DD)");
  }
  if (to < from) return fail("to must not be before from");

  const targets = await resolveTargets(b);
  if ("error" in targets) return fail(targets.error);
  const { employees } = targets;

  const days = eachDay(from, to);
  if (employees.length * days.length > MAX_BULK_ROWS) {
    return fail(
      `that is ${employees.length * days.length} employee-days — narrow the range or the selection (max ${MAX_BULK_ROWS})`,
    );
  }

  const org = await orgWeekOffPattern();
  const skipWeekOffs = b.skipWeekOffs !== false && shift !== "week_off";

  const ops: any[] = [];
  let skippedWeekOffs = 0;
  let skippedNotEmployed = 0;

  for (const e of employees as any[]) {
    const pattern = patternFor(e, org);
    for (const day of days) {
      if (e.joiningDate && new Date(e.joiningDate) > day) {
        skippedNotEmployed += 1;
        continue;
      }
      if (e.exitDate && new Date(e.exitDate) < day) {
        skippedNotEmployed += 1;
        continue;
      }
      if (skipWeekOffs && isWeekOff(day, pattern)) {
        skippedWeekOffs += 1;
        continue;
      }
      const date = dateKey(day);
      ops.push({
        updateOne: {
          filter: { employeeId: e._id, date, shift },
          update: {
            $set: {
              workShiftId: b.workShiftId || undefined,
              startTime: b.startTime || undefined,
              endTime: b.endTime || undefined,
              department: b.department || undefined,
              section: b.section || undefined,
              notes: b.notes || undefined,
            },
            $setOnInsert: { employeeId: e._id, date, shift },
          },
          upsert: true,
        },
      });
    }
  }

  let assigned = 0;
  let updated = 0;
  if (ops.length) {
    const res = await EmployeeShift.bulkWrite(ops, { ordered: false });
    assigned = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  req.rData = {
    employees: employees.length,
    days: days.length,
    assigned,
    updated,
    skippedWeekOffs,
    skippedNotEmployed,
  };
  req.msg = "saved";
  return next();
};

/** DELETE /bulk — clear a roster range again (the undo for the above). */
export const bulkRemove = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const from = String(b.from || "");
  const to = String(b.to || from);

  const fail = (hint: string) => {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint };
    return next();
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("from and to must be dates (YYYY-MM-DD)");
  }
  if (to < from) return fail("to must not be before from");

  // Same targeting as assigning, so "clear this department's week" doesn't
  // depend on the caller having every matching id to hand.
  const targets = await resolveTargets(b);
  if ("error" in targets) return fail(targets.error);

  const query: any = {
    employeeId: { $in: targets.employees.map((e: any) => e._id) },
    date: { $gte: from, $lte: to },
  };
  if (b.shift && SHIFTS.has(String(b.shift))) query.shift = b.shift;

  const res = await EmployeeShift.deleteMany(query);
  req.rData = { removed: res.deletedCount || 0 };
  req.msg = "deleted";
  return next();
};
