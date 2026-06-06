import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { Payslip } from "../../models/payslip.model";
import { nextSequence } from "../../models/counter.model";

/**
 * HR — Employee CRUD. Employee codes are minted atomically as HWE-000123.
 */

const pad = (n: number) => String(n).padStart(6, "0");

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const search = ((req.query.search as string) || "").trim();

  const query: any = { isDeleted: false };
  if (req.query.status) query.status = req.query.status;
  if (req.query.departmentId) query.departmentId = req.query.departmentId;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ fullName: rx }, { employeeCode: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    HrEmployee.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("departmentId", "name")
      .populate("designationId", "name")
      .populate("employmentTypeId", "name")
      .lean(),
    HrEmployee.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "employee_list";
  return next();
};

export const detail = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const employee = await HrEmployee.findOne({
    _id: req.params.id,
    isDeleted: false,
  })
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .populate("employmentTypeId", "name")
    .populate("reportingToId", "fullName employeeCode")
    .lean();

  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }

  const [recentAttendance, leaves, payslips] = await Promise.all([
    Attendance.find({ employeeId: employee._id })
      .sort({ date: -1 })
      .limit(31)
      .lean(),
    LeaveRequest.find({ employeeId: employee._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("leaveTypeId", "name code")
      .lean(),
    Payslip.find({ employeeId: employee._id })
      .sort({ year: -1, month: -1 })
      .limit(12)
      .lean(),
  ]);

  req.rData = { employee, recentAttendance, leaves, payslips };
  req.msg = "employee_detail";
  return next();
};

const ASSIGNABLE = [
  "fullName",
  "email",
  "phone",
  "gender",
  "address",
  "departmentId",
  "designationId",
  "employmentTypeId",
  "reportingToId",
  "photo",
  "status",
  "bankName",
  "accountNumber",
  "ifsc",
  "pan",
  "aadhaar",
  "uan",
  "pfNumber",
  "esiNumber",
];

export const create = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.fullName || !b.joiningDate) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "fullName and joiningDate are required" };
    return next();
  }

  const seq = await nextSequence("hr_employee");
  const employeeCode = `HWE-${pad(seq)}`;

  const doc: any = {
    employeeCode,
    joiningDate: new Date(b.joiningDate),
    createdByAdminId: adminId,
  };
  for (const f of ASSIGNABLE) if (b[f] !== undefined) doc[f] = b[f];
  if (b.dob) doc.dob = new Date(b.dob);
  if (b.exitDate) doc.exitDate = new Date(b.exitDate);
  if (b.salaryStructure) doc.salaryStructure = b.salaryStructure;

  const employee = await HrEmployee.create(doc);

  req.rData = { employee };
  req.msg = "employee_created";
  return next();
};

export const update = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const employee = await HrEmployee.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }

  for (const f of ASSIGNABLE) if (b[f] !== undefined) (employee as any)[f] = b[f];
  if (b.dob !== undefined) employee.dob = b.dob ? new Date(b.dob) : undefined;
  if (b.joiningDate !== undefined && b.joiningDate)
    employee.joiningDate = new Date(b.joiningDate);
  if (b.exitDate !== undefined)
    employee.exitDate = b.exitDate ? new Date(b.exitDate) : undefined;

  await employee.save();
  req.rData = { employee };
  req.msg = "employee_updated";
  return next();
};

/** PUT /:id/salary-structure — update the CTC / salary structure only. */
export const updateSalaryStructure = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const employee = await HrEmployee.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }

  employee.salaryStructure = {
    ...(employee.salaryStructure as any),
    ...b,
  } as any;
  await employee.save();

  req.rData = { employee };
  req.msg = "salary_structure_updated";
  return next();
};

export const remove = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const employee = await HrEmployee.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }
  employee.isDeleted = true;
  employee.isActive = false;
  employee.status = "terminated";
  await employee.save();
  req.rData = {};
  req.msg = "employee_deleted";
  return next();
};
