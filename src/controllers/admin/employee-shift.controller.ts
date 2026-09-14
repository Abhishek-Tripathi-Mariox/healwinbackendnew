import { Request, Response, NextFunction } from "express";
import EmployeeShift from "../../models/employee-shift.model";
import HrEmployee from "../../models/hr-employee.model";
import { Types } from "mongoose";

/** Admin: hospital/HR staff shift scheduling. */
const SHIFTS = new Set(["morning", "evening", "night", "general"]);

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
    q.designationId = designationId === "none" ? null : designationId;
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

  const items = await EmployeeShift.find(query)
    .sort({ date: 1, shift: 1 })
    .limit(1000)
    .populate({
      path: "employeeId",
      select: "fullName employeeCode departmentId designationId",
      populate: [
        { path: "departmentId", select: "name" },
        { path: "designationId", select: "name" },
      ],
    })
    .lean();
  req.rData = { items };
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
    q.designationId =
      req.query.designationId === "none" ? null : req.query.designationId;
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
