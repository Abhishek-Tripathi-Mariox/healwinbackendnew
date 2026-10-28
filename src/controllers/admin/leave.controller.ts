import { Request, Response, NextFunction } from "express";
import { LeaveType } from "../../models/leave-type.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { LeaveBalance } from "../../models/leave-balance.model";
import Attendance from "../../models/attendance.model";
import { sendToStaff } from "../../services/notification.service";
import { withTransaction } from "../../utils/txn.util";
import { paginate } from "../../utils/paginate.util";
import { Types } from "mongoose";
import HrEmployee from "../../models/hr-employee.model";
import { balanceSheet, runRollover, syncEntitlement } from "../../services/leave-entitlement.service";

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
    accrual: (b.accrual === "monthly" ? "monthly" : "annual") as "monthly" | "annual",
    carryForward: b.carryForward === true,
    // Only meaningful with carryForward on; 0 means uncapped.
    maxCarryForward: Math.max(0, Number(b.maxCarryForward) || 0),
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

  // Work out what they are actually entitled to before checking against it.
  // The old code fell back to the type's full annual quota when no balance
  // row existed, which credited a November joiner a whole year of leave on
  // their first request.
  // `employeeId` is absent on an ambulance-staff request, which returns
  // above before reaching here — but the type does not know that.
  if (lr.employeeId) await syncEntitlement(lr.employeeId, year);

  // Don't let a paid-leave approval silently drive the balance negative. HR can
  // still do it deliberately with overrideBalance — some approvals genuinely
  // are granted beyond quota — but it becomes a decision, not an accident.
  if (leaveType?.isPaid) {
    const existing = await LeaveBalance.findOne({
      employeeId: lr.employeeId,
      leaveTypeId: lr.leaveTypeId,
      year,
    }).lean();
    const available = existing ? existing.balance : 0;
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
    // `syncEntitlement` above has already created the row with the right
    // accrued figure, so this only guards the case where it could not (an
    // employee record that has since gone).
    await LeaveBalance.updateOne(
      { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year },
      { $setOnInsert: { allocated: quota, carriedForward: 0, used: 0, balance: quota } },
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

/**
 * GET /admin/hr/leave/employee/:employeeId — one person's leave, end to end.
 *
 * Entitlement per type (accrued and pro-rata), what was carried in, what has
 * been taken, what is awaiting a decision, what is left — plus the actual
 * history of requests for the year, split paid vs unpaid.
 *
 * Previously the only per-employee view was a 20-row list of requests with no
 * balances at all, and `GET /balances` only ever returned rows that happened
 * to exist because someone had already taken leave.
 */
export const employeeLeave = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const employeeId = req.params.employeeId as string;
  if (!Types.ObjectId.isValid(employeeId)) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );

  const employee: any = await HrEmployee.findById(employeeId)
    .select("fullName employeeCode joiningDate exitDate departmentId designationId")
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .lean();
  if (!employee) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }

  const [entitlements, history] = await Promise.all([
    balanceSheet(employeeId, year),
    LeaveRequest.find({
      employeeId,
      fromDate: { $lte: new Date(year, 11, 31, 23, 59, 59) },
      toDate: { $gte: new Date(year, 0, 1) },
    })
      .populate("leaveTypeId", "name code isPaid")
      .populate("approverAdminId", "fullName")
      .sort({ fromDate: -1 })
      .lean(),
  ]);

  // Paid vs unpaid is a property of the TYPE, so it is summed from the type
  // rather than from anything stored on the request.
  const approved = history.filter((h: any) => h.status === "approved");
  const paidDays = approved
    .filter((h: any) => h.leaveTypeId?.isPaid !== false)
    .reduce((n: number, h: any) => n + (h.days || 0), 0);
  const unpaidDays = approved
    .filter((h: any) => h.leaveTypeId?.isPaid === false)
    .reduce((n: number, h: any) => n + (h.days || 0), 0);

  req.rData = {
    year,
    employee,
    entitlements,
    totals: {
      entitled: entitlements.reduce((n, e) => n + e.allocated + e.carriedForward, 0),
      used: entitlements.reduce((n, e) => n + e.used, 0),
      balance: entitlements.reduce((n, e) => n + e.balance, 0),
      pending: entitlements.reduce((n, e) => n + e.pending, 0),
      paidDays,
      unpaidDays,
    },
    history,
  };
  req.msg = "success";
  return next();
};

/**
 * POST /admin/hr/leave/balances/sync — bring entitlement up to date.
 *
 * Creates the missing rows and tops up monthly accrual. Run for one employee
 * or, with no body, for everyone on the rolls — which is what makes a
 * balance appear for people who have never taken leave.
 */
export const syncBalances = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const year = parseInt(
    String(req.body?.year || new Date().getFullYear()),
    10,
  );
  const one = req.body?.employeeId;

  const employees: any[] = one
    ? [{ _id: one }]
    : await HrEmployee.find({ isDeleted: false, status: { $ne: "terminated" } })
        .select("_id")
        .lean();

  let touched = 0;
  for (const e of employees) {
    touched += await syncEntitlement(e._id, year);
  }

  req.rData = { year, employees: employees.length, rowsUpdated: touched };
  req.msg = `Entitlement updated for ${employees.length} employee(s).`;
  return next();
};

/**
 * POST /admin/hr/leave/balances/rollover — close a year, open the next.
 *
 * Unused days roll over for the types that allow it, capped by the type.
 * Safe to run twice: it sets next year's carried-forward rather than adding
 * to it.
 */
export const rolloverBalances = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const fromYear = parseInt(String(req.body?.fromYear || ""), 10);
  const toYear = parseInt(String(req.body?.toYear || fromYear + 1), 10);
  if (!fromYear || !toYear || toYear <= fromYear) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Give the year being closed; the next one follows it." };
    return next();
  }

  const result = await runRollover({ fromYear, toYear, employeeId: req.body?.employeeId });
  req.rData = { fromYear, toYear, ...result };
  req.msg = `${result.daysCarried} day(s) carried into ${toYear} for ${result.employees} employee(s).`;
  return next();
};
