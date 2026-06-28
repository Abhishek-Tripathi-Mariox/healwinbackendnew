import { Request, Response, NextFunction } from "express";
import EmployeeShift from "../../models/employee-shift.model";
import HrEmployee from "../../models/hr-employee.model";

/** Admin: hospital/HR staff shift scheduling. */
const SHIFTS = new Set(["morning", "evening", "night", "general"]);

// GET /?date=YYYY-MM-DD — shifts for a day (optionally a single employee).
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.date) query.date = req.query.date;
  if (req.query.employeeId) query.employeeId = req.query.employeeId;
  const items = await EmployeeShift.find(query)
    .sort({ date: 1, shift: 1 })
    .limit(500)
    .populate("employeeId", "fullName employeeCode")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

// GET /employees — employee picker for the schedule form.
export const employees = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await HrEmployee.find({ isDeleted: false, status: { $ne: "terminated" } })
    .select("fullName employeeCode")
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
