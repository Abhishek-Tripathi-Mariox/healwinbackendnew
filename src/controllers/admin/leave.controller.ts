import { Request, Response, NextFunction } from "express";
import { LeaveType } from "../../models/leave-type.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { LeaveBalance } from "../../models/leave-balance.model";
import Attendance from "../../models/attendance.model";
import { sendToStaff } from "../../services/notification.service";
import { withTransaction } from "../../utils/txn.util";
import { paginate } from "../../utils/paginate.util";

const fmtD = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// Notify an ambulance-staff member of a leave decision (push + in-app bell).
const notifyStaffDecision = (lr: any, approved: boolean) => {
  if (lr.subjectType !== "ambulance_staff" || !lr.ambulanceStaffId) return;
  const range = `${fmtD(lr.fromDate)}–${fmtD(lr.toDate)}`;
  void sendToStaff(
    lr.ambulanceStaffId,
    "SYSTEM",
    approved ? "Leave Approved" : "Leave Rejected",
    `Your ${lr.leaveTypeName || "leave"} (${range}) has been ${approved ? "approved" : "rejected"}.`,
    { leaveId: String(lr._id), status: approved ? "approved" : "rejected", route: "Leave" },
    lr._id,
    "LeaveRequest",
  ).catch(() => undefined);
};

/**
 * HR — Leave types, requests and balances.
 *
 * Approving a request writes `leave` attendance rows across the date range and
 * decrements the matching yearly LeaveBalance, so the roster and payroll stay
 * consistent with the decision.
 */

// ---------- Leave Types ----------

export const listTypes = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { items, pagination } = await paginate(
    LeaveType,
    {},
    req,
    { createdAt: 1 },
  );
  req.rData = { items, pagination };
  req.msg = "leave_type_list";
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
  const item = (req.params.id as string)
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
  if (req.query.subjectType) query.subjectType = req.query.subjectType;

  const { items: rows, pagination } = await paginate<any>(
    LeaveRequest,
    query,
    req,
    { createdAt: -1 },
    [
      { path: "employeeId", select: "fullName employeeCode" },
      { path: "ambulanceStaffId", select: "fullName mobileNumber role" },
      { path: "leaveTypeId", select: "name code isPaid" },
    ],
  );

  // Unified row: a single `subjectName` + `typeName` regardless of staff kind,
  // so one HR Leave page renders HR employees and ambulance crew together.
  const items = rows.map((lr) => ({
    ...lr,
    subjectName:
      lr.subjectType === "ambulance_staff"
        ? lr.ambulanceStaffId?.fullName || "Ambulance staff"
        : lr.employeeId?.fullName || "Employee",
    subjectRef:
      lr.subjectType === "ambulance_staff"
        ? `${(lr.ambulanceStaffId?.role || "crew")}${lr.ambulanceStaffId?.mobileNumber ? ` · ${lr.ambulanceStaffId.mobileNumber}` : ""}`
        : lr.employeeId?.employeeCode || "",
    typeName: lr.leaveTypeId?.name || lr.leaveTypeName || "Leave",
  }));

  req.rData = { items, pagination };
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

  // Ambulance staff aren't on HR attendance/payroll balance — just record the
  // decision and notify their app. (Central store, branched handling.)
  if (lr.subjectType === "ambulance_staff") {
    lr.status = "approved";
    lr.approverAdminId = adminId;
    lr.decisionNote = req.body?.decisionNote;
    lr.decidedAt = new Date();
    await lr.save();
    notifyStaffDecision(lr, true);
    req.rData = { item: lr };
    req.msg = "leave_request_updated";
    return next();
  }

  // Refuse to approve leave that overlaps leave this employee has already been
  // granted — approving both would write the same attendance days twice and
  // decrement the balance twice for one absence.
  const overlap: any = await LeaveRequest.findOne({
    _id: { $ne: lr._id },
    subjectType: "hr_employee",
    employeeId: lr.employeeId,
    status: "approved",
    fromDate: { $lte: lr.toDate },
    toDate: { $gte: lr.fromDate },
  })
    .select("fromDate toDate")
    .lean();
  if (overlap) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `this employee already has approved leave from ${fmtD(overlap.fromDate)} to ${fmtD(overlap.toDate)}`,
    };
    return next();
  }

  const year = lr.fromDate.getFullYear();
  const leaveType = await LeaveType.findById(lr.leaveTypeId).lean();
  const quota = leaveType?.annualQuota || 0;

  // Don't let a paid-leave approval silently drive the balance negative. HR can
  // still do it deliberately with overrideBalance — some approvals genuinely
  // are granted beyond quota — but it becomes a decision, not an accident.
  if (leaveType?.isPaid) {
    const existing = await LeaveBalance.findOne({
      employeeId: lr.employeeId,
      leaveTypeId: lr.leaveTypeId,
      year,
    }).lean();
    const available = existing ? existing.balance : quota;
    if (lr.days > available && req.body?.overrideBalance !== true) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = {
        hint: `only ${available} day(s) of ${leaveType.name} left for ${year}, but ${lr.days} requested`,
        available,
        requested: lr.days,
        requiresOverride: true,
      };
      return next();
    }
  }

  // Approval touches three collections. Do it atomically where the deployment
  // allows; the fallback order (request → attendance → balance) leaves the
  // recoverable state if a standalone box dies midway — a request marked
  // approved with a balance still to decrement is visible and fixable, whereas
  // a decremented balance with no approved request is not.
  await withTransaction(async (session) => {
    lr.status = "approved";
    lr.approverAdminId = adminId;
    lr.decisionNote = req.body?.decisionNote;
    lr.decidedAt = new Date();
    await lr.save({ session });

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
    if (ops.length) await Attendance.bulkWrite(ops, { session });

    // Decrement the yearly balance for this employee + type. On first use, seed
    // `allocated` (and the opening balance) from the leave type's annual quota
    // so the running balance is meaningful rather than going straight negative.
    await LeaveBalance.updateOne(
      { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year },
      { $setOnInsert: { allocated: quota, used: 0, balance: quota } },
      { upsert: true, session },
    );
    await LeaveBalance.updateOne(
      { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year },
      { $inc: { used: lr.days, balance: -lr.days } },
      { session },
    );
  });

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

  notifyStaffDecision(lr, false);

  req.rData = { item: lr };
  req.msg = "leave_request_updated";
  return next();
};

/**
 * POST /admin/hr/leave/requests/:id/cancel
 *
 * Reverses a leave decision. Approving wrote attendance rows and spent
 * balance; cancelling has to undo both, or the employee stays marked absent
 * for days they actually worked and never gets those days back. Only rows
 * still marked `leave` for THIS request are removed — if HR has since
 * re-marked a day (say the employee came in after all), that correction wins.
 */
export const cancelRequest = async (
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
  if (lr.status === "cancelled" || lr.status === "rejected") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `request is already ${lr.status}` };
    return next();
  }

  const wasApproved = lr.status === "approved";
  const isHrEmployee = lr.subjectType === "hr_employee";

  await withTransaction(async (session) => {
    lr.status = "cancelled";
    lr.approverAdminId = adminId;
    lr.decisionNote = req.body?.decisionNote || lr.decisionNote;
    lr.decidedAt = new Date();
    await lr.save({ session });

    // A pending request never wrote anything, so there is nothing to unwind.
    if (!wasApproved || !isHrEmployee) return;

    await Attendance.deleteMany(
      { leaveRequestId: lr._id, status: "leave" },
      { session },
    );

    const year = lr.fromDate.getFullYear();
    await LeaveBalance.updateOne(
      { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year },
      { $inc: { used: -lr.days, balance: lr.days } },
      { session },
    );
  });

  // Tell the crew member their approved leave was withdrawn — they may have
  // planned around it.
  if (lr.subjectType === "ambulance_staff" && lr.ambulanceStaffId) {
    const range = `${fmtD(lr.fromDate)}–${fmtD(lr.toDate)}`;
    void sendToStaff(
      lr.ambulanceStaffId,
      "SYSTEM",
      "Leave Cancelled",
      `Your ${lr.leaveTypeName || "leave"} (${range}) has been cancelled.`,
      { leaveId: String(lr._id), status: "cancelled", route: "Leave" },
      lr._id,
      "LeaveRequest",
    ).catch(() => undefined);
  }

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
