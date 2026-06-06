import { Request, Response, NextFunction } from "express";
import { LeaveType } from "../../models/leave-type.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { LeaveBalance } from "../../models/leave-balance.model";
import Attendance from "../../models/attendance.model";

/**
 * HR — Leave types, requests and balances.
 *
 * Approving a request writes `leave` attendance rows across the date range and
 * decrements the matching yearly LeaveBalance, so the roster and payroll stay
 * consistent with the decision.
 */

// ---------- Leave Types ----------

export const listTypes = async (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const items = await LeaveType.find().sort({ createdAt: 1 }).lean();
  _req.rData = { items };
  _req.msg = "leave_type_list";
  return next();
};

export const saveType = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  if (!b.name || !b.code) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name and code are required" };
    return next();
  }
  const payload = {
    name: b.name,
    code: String(b.code).toUpperCase(),
    annualQuota: Number(b.annualQuota) || 0,
    isPaid: b.isPaid !== false,
    color: b.color,
    isActive: b.isActive !== false,
  };
  const item = req.params.id
    ? await LeaveType.findByIdAndUpdate(req.params.id, payload, { new: true })
    : await LeaveType.create(payload);

  req.rData = { item };
  req.msg = "leave_type_saved";
  return next();
};

// ---------- Leave Requests ----------

const daysBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;

const dayStart = (input: string | Date): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const listRequests = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.employeeId) query.employeeId = req.query.employeeId;

  const items = await LeaveRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("employeeId", "fullName employeeCode")
    .populate("leaveTypeId", "name code isPaid")
    .lean();

  req.rData = { items };
  req.msg = "leave_request_list";
  return next();
};

export const createRequest = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  if (!b.employeeId || !b.leaveTypeId || !b.fromDate || !b.toDate) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "employeeId, leaveTypeId, fromDate and toDate are required",
    };
    return next();
  }
  const fromDate = dayStart(b.fromDate);
  const toDate = dayStart(b.toDate);
  if (toDate < fromDate) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "toDate cannot be before fromDate" };
    return next();
  }
  const days = daysBetween(fromDate, toDate);

  const item = await LeaveRequest.create({
    employeeId: b.employeeId,
    leaveTypeId: b.leaveTypeId,
    fromDate,
    toDate,
    days,
    reason: b.reason,
    status: "pending",
  });

  req.rData = { item };
  req.msg = "leave_request_created";
  return next();
};

/** POST /admin/hr/leave/requests/:id/approve */
export const approveRequest = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const lr = await LeaveRequest.findById(req.params.id);
  if (!lr) {
    req.rCode = 5;
    req.msg = "leave_request_not_found";
    req.rData = {};
    return next();
  }
  if (lr.status !== "pending") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `request already ${lr.status}` };
    return next();
  }

  lr.status = "approved";
  lr.approverAdminId = adminId;
  lr.decisionNote = req.body?.decisionNote;
  lr.decidedAt = new Date();
  await lr.save();

  // Write leave attendance rows across the range (idempotent upsert).
  const ops: any[] = [];
  const cursor = new Date(lr.fromDate);
  while (cursor <= lr.toDate) {
    const date = dayStart(cursor);
    ops.push({
      updateOne: {
        filter: { employeeId: lr.employeeId, date },
        update: {
          $set: {
            status: "leave",
            leaveRequestId: lr._id,
            markedByAdminId: adminId,
          },
        },
        upsert: true,
      },
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  if (ops.length) await Attendance.bulkWrite(ops);

  // Decrement the yearly balance for this employee + type. On first use, seed
  // `allocated` (and the opening balance) from the leave type's annual quota so
  // the running balance is meaningful rather than going straight negative.
  const year = lr.fromDate.getFullYear();
  const leaveType = await LeaveType.findById(lr.leaveTypeId).lean();
  const quota = leaveType?.annualQuota || 0;
  await LeaveBalance.findOneAndUpdate(
    { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year },
    { $setOnInsert: { allocated: quota, used: 0, balance: quota } },
    { upsert: true },
  );
  await LeaveBalance.findOneAndUpdate(
    { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year },
    { $inc: { used: lr.days, balance: -lr.days } },
  );

  req.rData = { item: lr };
  req.msg = "leave_request_updated";
  return next();
};

/** POST /admin/hr/leave/requests/:id/reject */
export const rejectRequest = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const lr = await LeaveRequest.findById(req.params.id);
  if (!lr) {
    req.rCode = 5;
    req.msg = "leave_request_not_found";
    req.rData = {};
    return next();
  }
  if (lr.status !== "pending") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `request already ${lr.status}` };
    return next();
  }
  lr.status = "rejected";
  lr.approverAdminId = adminId;
  lr.decisionNote = req.body?.decisionNote;
  lr.decidedAt = new Date();
  await lr.save();

  req.rData = { item: lr };
  req.msg = "leave_request_updated";
  return next();
};

// ---------- Balances ----------

export const balances = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );
  const query: any = { year };
  if (req.query.employeeId) query.employeeId = req.query.employeeId;

  const items = await LeaveBalance.find(query)
    .populate("employeeId", "fullName employeeCode")
    .populate("leaveTypeId", "name code")
    .lean();

  req.rData = { year, items };
  req.msg = "leave_balance_list";
  return next();
};
