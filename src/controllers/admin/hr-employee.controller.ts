import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { Payslip } from "../../models/payslip.model";
import { nextSequence } from "../../models/counter.model";
import { EMPLOYEE_CATEGORIES } from "../../models/hr-employee.model";
import { uploadFileToAws } from "../../utils/s3";
import {
  createAdminForEmployee,
  setPanelRole,
  resetAdminPassword,
} from "../../services/employee-link.service";

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
  // "none" is how the caller asks for employees with no department — the
  // headcount breakdown reports those as "Unassigned", and drilling into that
  // row has to be able to say so. An empty value cannot carry the meaning:
  // it is indistinguishable from "no department filter at all".
  if (req.query.departmentId === "none") {
    query.departmentId = null;
  } else if (req.query.departmentId) {
    query.departmentId = req.query.departmentId;
  }
  if (req.query.category) query.category = String(req.query.category);
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
    _id: (req.params.id as string),
    isDeleted: false,
  })
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .populate("employmentTypeId", "name")
    .populate("reportingToId", "fullName employeeCode")
    // roleId too: the edit form preselects their current role, and without
    // it the dropdown would open blank and look like they had none.
    .populate("linkedAdminId", "fullName roleName roleId isActive")
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
  "category",
  "defaultShiftId",
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
  "linkedAdminId",
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

  /**
   * A panel login, when a role is chosen.
   *
   * Created BEFORE the employee on purpose: it is the step that can fail
   * (an email already taken, an invalid role), and failing after the employee
   * exists would leave a half-made person behind with no way to finish them
   * from this form.
   */
  let panelLogin:
    | { adminId: any; roleName: string; temporaryPassword?: string }
    | null = null;
  if (b.roleId) {
    try {
      panelLogin = await createAdminForEmployee({
        fullName: b.fullName,
        email: b.email,
        phone: b.phone,
        roleId: String(b.roleId),
        password: b.password,
        createdBy: adminId,
      });
    } catch (err: any) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = { hint: err?.message || "The panel login could not be created." };
      return next();
    }
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
  if (panelLogin) doc.linkedAdminId = panelLogin.adminId;

  const employee = await HrEmployee.create(doc);

  req.rData = {
    employee,
    ...(panelLogin
      ? {
          panelLogin: {
            role: panelLogin.roleName,
            email: b.email,
            // Shown once. It is stored hashed and cannot be retrieved later,
            // so the screen has to pass it on now.
            temporaryPassword: panelLogin.temporaryPassword,
          },
        }
      : {}),
  };
  req.msg = "employee_created";
  return next();
};

/**
 * POST /admin/hr/employees/:id/reset-password
 *
 * Reset an employee's panel password from the roster, so HR does not have to
 * find the same person again under Team Management. A password may be given;
 * otherwise one is generated. It is emailed and returned once — it is stored
 * hashed and cannot be read back.
 */
export const resetPanelPassword = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const employee = await HrEmployee.findOne({
    _id: req.params.id as string,
    isDeleted: false,
  }).lean();
  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }
  if (!employee.linkedAdminId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "This employee has no panel login. Give them a role first to create one.",
    };
    return next();
  }

  const given = String(req.body?.password || "").trim();
  if (given && given.length < 8) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "The password must be at least 8 characters." };
    return next();
  }

  try {
    const result = await resetAdminPassword(employee.linkedAdminId, given || undefined);
    req.rData = {
      email: result.email,
      temporaryPassword: result.password,
      emailSent: result.emailSent,
      ...(result.emailSent
        ? {}
        : { warning: "The password was reset, but the email could not be sent. Pass it on another way." }),
    };
    req.msg = "saved";
  } catch (err: any) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: err?.message || "The password could not be reset." };
  }
  return next();
};

export const update = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const employee = await HrEmployee.findOne({
    _id: (req.params.id as string),
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

  /**
   * The panel role.
   *
   * The form offers a role rather than a list of account names: which login
   * row someone is attached to is an implementation detail, and picking the
   * wrong name silently gave one person another person's permissions. Setting
   * a role here changes it on their existing login, or creates one if they do
   * not yet have access.
   *
   * Done BEFORE saving the employee, so a refusal — an email already taken, an
   * invalid role — leaves the record untouched rather than half-applied.
   */
  let panelLogin: { role: string; temporaryPassword?: string } | null = null;
  if (b.roleId) {
    try {
      const created = await setPanelRole(
        {
          _id: employee._id,
          fullName: employee.fullName,
          email: employee.email,
          phone: employee.phone,
          linkedAdminId: employee.linkedAdminId,
        },
        String(b.roleId),
        (req as any).adminId,
      );
      if (created) {
        employee.linkedAdminId = created.adminId;
        panelLogin = {
          role: created.roleName,
          temporaryPassword: created.temporaryPassword,
        };
      }
    } catch (err: any) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = { hint: err?.message || "The panel role could not be set." };
      return next();
    }
  }

  await employee.save();
  req.rData = {
    employee,
    ...(panelLogin ? { panelLogin: { ...panelLogin, email: employee.email } } : {}),
  };
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
    _id: (req.params.id as string),
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
    _id: (req.params.id as string),
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

/**
 * POST /admin/hr/employees/:id/documents  (multipart: file)
 *
 * Employee documents (§2). Candidate paperwork is already handled on the
 * recruitment side; once someone is hired there was nowhere to keep their ID
 * proof, certificates or contract. Files go to the same S3 bucket as every
 * other upload.
 */
export const addDocument = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const file = (req as any).file as Express.Multer.File | undefined;
  const name = String(req.body?.name || "").trim();

  if (!file) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "a file is required" };
    return next();
  }
  if (!name) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "a document name is required" };
    return next();
  }

  const employee = await HrEmployee.findOne({
    _id: req.params.id as string,
    isDeleted: false,
  });
  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }

  const { images } = await uploadFileToAws([file]);
  const url = images as unknown as string;

  employee.documents = [
    ...(employee.documents || []),
    {
      name,
      type: req.body?.type,
      url,
      uploadedAt: new Date(),
      uploadedByAdminId: adminId,
    },
  ];
  await employee.save();

  req.rData = { documents: employee.documents };
  req.msg = "saved";
  return next();
};

/** DELETE /admin/hr/employees/:id/documents/:docId */
export const removeDocument = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const employee = await HrEmployee.findOne({
    _id: req.params.id as string,
    isDeleted: false,
  });
  if (!employee) {
    req.rCode = 5;
    req.msg = "employee_not_found";
    req.rData = {};
    return next();
  }
  // The S3 object is deliberately left in place: an employment document that
  // was removed from the record by mistake should still be recoverable.
  employee.documents = (employee.documents || []).filter(
    (d: any) => String(d._id) !== String(req.params.docId),
  );
  await employee.save();
  req.rData = { documents: employee.documents };
  req.msg = "deleted";
  return next();
};

/** GET /admin/hr/employees/meta — the pick-lists the employee form needs. */
export const meta = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  req.rData = { categories: EMPLOYEE_CATEGORIES };
  req.msg = "success";
  return next();
};
