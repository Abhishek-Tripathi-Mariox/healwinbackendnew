import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { PayrollRun } from "../../models/payroll-run.model";
import { Payslip } from "../../models/payslip.model";
import { LeaveType } from "../../models/leave-type.model";
import { LeaveRequest } from "../../models/leave-request.model";
import Attendance from "../../models/attendance.model";
import { payrollPeriod } from "../../services/payroll-period";
import {
  getCycleStartDay,
  setCycleStartDay,
} from "../../services/payroll-settings.service";
import {
  buildAttendanceSummary,
  computePayslip,
  salaryOf,
} from "../../services/payroll.service";
import { generatePayslipPDF } from "../../services/pdf.service";

/**
 * HR — Payroll. `generate` is idempotent for a (month, year): it re-uses the
 * existing draft run and re-computes payslips. A finalized run is locked.
 */

/**
 * POST /admin/hr/payroll/generate  body: { month, year, tds?: {employeeId: amount} }
 */
/**
 * GET /admin/hr/payroll/settings — the payroll calendar.
 *
 * Also returns the period the current and next runs would cover, so the screen
 * can show what the setting actually means rather than a bare number.
 */
export const settingsGet = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const cycleStartDay = await getCycleStartDay();
  const now = new Date();
  const cur = payrollPeriod(now.getMonth() + 1, now.getFullYear(), cycleStartDay);
  req.rData = {
    cycleStartDay,
    currentPeriod: {
      month: cur.month,
      year: cur.year,
      label: cur.label,
      totalDays: cur.totalDays,
    },
  };
  req.msg = "success";
  return next();
};

/** PUT /admin/hr/payroll/settings */
export const settingsUpdate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const day = Number(req.body?.cycleStartDay);
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "cycleStartDay must be a day of the month (1-31)." };
    return next();
  }

  // Changing the calendar under a run that is already locked would make its
  // payslips describe days it never covered.
  const finalized = await PayrollRun.countDocuments({ status: "finalized" });
  const saved = await setCycleStartDay(day, (req as any).adminId);
  const preview = payrollPeriod(
    new Date().getMonth() + 1,
    new Date().getFullYear(),
    saved,
  );
  req.rData = {
    cycleStartDay: saved,
    currentPeriod: { label: preview.label, totalDays: preview.totalDays },
    ...(finalized
      ? {
          note: `${finalized} finalized run(s) keep the period they were run under — only future runs use the new cycle.`,
        }
      : {}),
  };
  req.msg = "saved";
  return next();
};

export const generate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const month = parseInt(b.month, 10);
  const year = parseInt(b.year, 10);
  if (!(month >= 1 && month <= 12) || !year) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "valid month (1-12) and year are required" };
    return next();
  }
  const tdsMap: Record<string, number> = b.tds || {};
  // Overtime rate policy is HR's to set (spec §17); the engine's statutory
  // default applies unless this run overrides it.
  const overtimeMultiplier =
    b.overtimeMultiplier !== undefined && Number.isFinite(Number(b.overtimeMultiplier))
      ? Math.max(0, Number(b.overtimeMultiplier))
      : undefined;

  let run = await PayrollRun.findOne({ month, year });
  if (run && run.status === "finalized") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "this payroll run is finalized and cannot be re-run" };
    return next();
  }

  // The period this run covers. With the hospital's 16th-to-15th cycle this is
  // NOT the calendar month, and every window below — unpaid-leave overlap, the
  // "was anything marked?" check, and the joined/left eligibility test — has to
  // use it. Reading the calendar month instead would look at the wrong days and
  // quietly pay the wrong people the wrong amounts.
  const cycleStartDay = await getCycleStartDay();
  const period = payrollPeriod(month, year, cycleStartDay);
  const monthStart = period.start;
  const monthEnd = period.end;

  // Resolve unpaid leave-request ids that overlap this period (so unpaid leave
  // days are treated as LOP by the attendance summary).
  const unpaidTypes = await LeaveType.find({ isPaid: false }).select("_id").lean();
  const unpaidTypeIds = unpaidTypes.map((t) => t._id);
  const unpaidReqs = unpaidTypeIds.length
    ? await LeaveRequest.find({
        leaveTypeId: { $in: unpaidTypeIds },
        status: "approved",
        fromDate: { $lte: monthEnd },
        toDate: { $gte: monthStart },
      })
        .select("_id")
        .lean()
    : [];
  const unpaidReqIds = new Set(unpaidReqs.map((r) => String(r._id)));

  // Who gets paid this cycle. `inactive` and `terminated` are off the payroll;
  // `on_leave` stays on it (they are still employed, and their leave days are
  // already reflected in attendance). Anyone who joined after the month ended,
  // or left before it began, is skipped entirely — buildAttendanceSummary
  // would return zero service days for them anyway, but excluding them here
  // keeps them off the run's employee count and out of the payslip list.
  // Attendance fails OPEN by design: a day with no record is paid, so that
  // weekends and holidays nobody marks don't dock anyone. The failure mode is
  // a month where attendance was never marked at all — payroll would then pay
  // every employee a full month without a word. Refuse that run unless it is
  // explicitly acknowledged.
  const markedRows = await Attendance.countDocuments({
    date: { $gte: monthStart, $lte: monthEnd },
  });
  if (markedRows === 0 && b.acknowledgeUnmarked !== true) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint:
        `No attendance was marked for ${period.label}, so every employee would be paid in full. ` +
        "Mark attendance first, or re-submit with acknowledgeUnmarked=true to pay a full period deliberately.",
      unmarkedMonth: true,
    };
    return next();
  }

  /**
   * Anyone without a salary configured is left out, and named in the response.
   *
   * Every panel user now also has an HR record — which is right, they are
   * employees — but HR has not necessarily filled in their pay yet. Running
   * them through the engine produces a payslip of zero: not wrong exactly, but
   * it buries the real payroll in blank rows and looks like everyone was paid
   * nothing. Skipping them and saying who was skipped is the useful behaviour.
   */
  const noSalary: { name: string; employeeCode: string }[] = [];

  const employees = (
    await HrEmployee.find({
      isDeleted: false,
      status: { $in: ["active", "on_leave"] },
    }).lean()
  ).filter((e: any) => {
    const joined = e.joiningDate ? new Date(e.joiningDate) : null;
    const exited = e.exitDate ? new Date(e.exitDate) : null;
    if (joined && joined > monthEnd) return false;
    if (exited && exited < monthStart) return false;
    if (!(Number(e.salaryStructure?.ctcAnnual) > 0)) {
      noSalary.push({ name: e.fullName, employeeCode: e.employeeCode });
      return false;
    }
    return true;
  });

  if (!run) {
    run = await PayrollRun.create({
      month,
      year,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      status: "draft",
      runByAdminId: adminId,
    });
  } else {
    // A re-run may happen after the cycle setting changed — record what this
    // run actually covered.
    run.periodStart = period.start;
    run.periodEnd = period.end;
    run.periodLabel = period.label;
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  // Employees whose month is largely unmarked — paid in full by the fail-open
  // rule above. Returned so HR can see who was paid on assumption, not record.
  const unmarkedWarnings: { name: string; unmarkedDays: number; serviceDays: number }[] = [];
  let totalOvertimeAmount = 0;

  for (const emp of employees) {
    const summary = await buildAttendanceSummary(
      emp._id,
      month,
      year,
      unpaidReqIds,
      "hr_employee",
      { joiningDate: emp.joiningDate, exitDate: emp.exitDate },
      cycleStartDay,
    );
    const computed = computePayslip(salaryOf(emp), summary, {
      tds: tdsMap[String(emp._id)] || 0,
      overtimeMultiplier,
    });

    totalGross += computed.earnings.gross;
    totalDeductions += computed.deductions.total;
    totalNet += computed.netPay;
    totalOvertimeAmount += computed.earnings.overtime;
    if (computed.unmarkedDays > 0) {
      unmarkedWarnings.push({
        name: emp.fullName,
        unmarkedDays: computed.unmarkedDays,
        serviceDays: computed.serviceDays,
      });
    }

    await Payslip.findOneAndUpdate(
      { employeeId: emp._id, month, year },
      {
        $set: {
          runId: run._id,
          subjectType: "hr_employee",
          employeeId: emp._id,
          month,
          year,
          periodLabel: period.label,
          employeeCode: emp.employeeCode,
          employeeName: emp.fullName,
          totalDays: computed.totalDays,
          serviceDays: computed.serviceDays,
          unmarkedDays: computed.unmarkedDays,
          workedMinutes: computed.workedMinutes,
          overtimeMinutes: computed.overtimeMinutes,
          overtimeAmount: computed.earnings.overtime,
          paidDays: computed.paidDays,
          lopDays: computed.lopDays,
          leaveDays: computed.leaveDays,
          earnings: computed.earnings,
          deductions: computed.deductions,
          netPay: computed.netPay,
          status: "draft",
        },
      },
      { upsert: true },
    );
  }

  // Ambulance crew on monthly salary (salaryStructure set) — same engine, days
  // sourced from central attendance keyed by ambulanceStaffId.
  const crew = await AmbulanceStaff.find({
    isDeleted: { $ne: true },
    "salaryStructure.ctcAnnual": { $gt: 0 },
  }).lean();
  for (const s of crew as any[]) {
    const summary = await buildAttendanceSummary(
      s._id,
      month,
      year,
      unpaidReqIds,
      "ambulance_staff",
      {},
      cycleStartDay,
    );
    const computed = computePayslip(s.salaryStructure, summary, {
      tds: tdsMap[String(s._id)] || 0,
      overtimeMultiplier,
    });
    totalGross += computed.earnings.gross;
    totalDeductions += computed.deductions.total;
    totalNet += computed.netPay;
    totalOvertimeAmount += computed.earnings.overtime;
    await Payslip.findOneAndUpdate(
      { ambulanceStaffId: s._id, month, year },
      {
        $set: {
          runId: run._id,
          subjectType: "ambulance_staff",
          ambulanceStaffId: s._id,
          month,
          year,
          periodLabel: period.label,
          employeeCode: s.role === "attendant" ? "ATT" : "DRV",
          employeeName: s.fullName,
          designation: s.role === "attendant" ? "Ambulance Attendant" : "Ambulance Driver",
          totalDays: computed.totalDays,
          serviceDays: computed.serviceDays,
          unmarkedDays: computed.unmarkedDays,
          workedMinutes: computed.workedMinutes,
          overtimeMinutes: computed.overtimeMinutes,
          overtimeAmount: computed.earnings.overtime,
          paidDays: computed.paidDays,
          lopDays: computed.lopDays,
          leaveDays: computed.leaveDays,
          earnings: computed.earnings,
          deductions: computed.deductions,
          netPay: computed.netPay,
          status: "draft",
        },
      },
      { upsert: true },
    );
  }

  run.employeeCount = employees.length + crew.length;
  run.totalGross = Math.round(totalGross * 100) / 100;
  run.totalDeductions = Math.round(totalDeductions * 100) / 100;
  run.totalNet = Math.round(totalNet * 100) / 100;
  run.totalOvertimeAmount = Math.round(totalOvertimeAmount * 100) / 100;
  // Re-generating resets a verified run to draft: the figures just changed,
  // so the previous sign-off no longer describes what is on the sheet.
  if (run.status === "verified") {
    run.status = "draft";
    run.verifiedByAdminId = undefined;
    run.verifiedAt = undefined;
    run.verificationNote = undefined;
    await Payslip.updateMany({ runId: run._id }, { status: "draft" });
  }
  await run.save();

  req.rData = {
    run,
    unmarkedWarnings,
    // Who was left out for want of a salary, so HR can complete them rather
    // than wonder why the headcount and the payslip count differ.
    skippedNoSalary: noSalary,
  };
  req.msg = "payroll_generated";
  return next();
};

export const runsList = async (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const items = await PayrollRun.find()
    .sort({ year: -1, month: -1 })
    .limit(60)
    .lean();
  _req.rData = { items };
  _req.msg = "payrun_list";
  return next();
};

export const runDetail = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const run = await PayrollRun.findById(req.params.id).lean();
  if (!run) {
    req.rCode = 5;
    req.msg = "payrun_not_found";
    req.rData = {};
    return next();
  }
  const payslips = await Payslip.find({ runId: run._id })
    .sort({ employeeName: 1 })
    .lean();
  req.rData = { run, payslips };
  req.msg = "payrun_detail";
  return next();
};

export const payslipDetail = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const payslip = await Payslip.findById(req.params.id)
    .populate("employeeId", "fullName employeeCode pan accountNumber uan bankName")
    .lean();
  if (!payslip) {
    req.rCode = 5;
    req.msg = "payslip_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { payslip };
  req.msg = "payslip_detail";
  return next();
};

/**
 * POST /admin/hr/payroll/runs/:id/verify
 *
 * HR's sign-off that the computed sheet is correct, before it is locked. The
 * spec's salary process runs on the 16th after verification, so this is a
 * deliberate checkpoint rather than a formality: a run cannot be finalized
 * until someone has verified it, and re-generating clears the sign-off.
 */
export const verify = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const run = await PayrollRun.findById(req.params.id);
  if (!run) {
    req.rCode = 5;
    req.msg = "payrun_not_found";
    req.rData = {};
    return next();
  }
  if (run.status === "finalized") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "this run is already finalized" };
    return next();
  }
  run.status = "verified";
  run.verifiedByAdminId = adminId;
  run.verifiedAt = new Date();
  run.verificationNote = req.body?.note;
  await run.save();
  await Payslip.updateMany({ runId: run._id }, { status: "verified" });
  req.rData = { run };
  req.msg = "payrun_verified";
  return next();
};

export const finalize = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const run = await PayrollRun.findById(req.params.id);
  if (!run) {
    req.rCode = 5;
    req.msg = "payrun_not_found";
    req.rData = {};
    return next();
  }
  if (run.status === "finalized") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "this run is already finalized" };
    return next();
  }
  // Finalizing is irreversible and pays people. It must follow a verification,
  // so the figures have been read by a human before they are locked.
  if (run.status !== "verified") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "verify this run before finalizing it — payroll must be checked before it is locked",
      requiresVerification: true,
    };
    return next();
  }
  run.status = "finalized";
  run.finalizedByAdminId = adminId;
  run.finalizedAt = new Date();
  await run.save();
  await Payslip.updateMany({ runId: run._id }, { status: "finalized" });
  req.rData = { run };
  req.msg = "payrun_finalized";
  return next();
};

/**
 * GET /admin/hr/payroll/payslip/:id/pdf — streams a payslip PDF.
 * This handler writes the response itself and does NOT use ResponseMiddleware.
 */
export const payslipPdf = async (req: Request, res: Response) => {
  const payslip = await Payslip.findById(req.params.id).lean();
  if (!payslip) {
    return res.status(404).json({ code: 5, message: "payslip not found" });
  }
  // Crew payslips have no HrEmployee record — the payslip already snapshots
  // name/code, so the PDF renders fine without statutory IDs.
  const employee = payslip.employeeId
    ? await HrEmployee.findById(payslip.employeeId)
        .select("pan accountNumber uan designationId")
        .lean()
    : null;

  const buffer = await generatePayslipPDF(payslip as any, employee as any);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="payslip-${payslip.employeeCode}-${payslip.month}-${payslip.year}.pdf"`,
  );
  return res.end(buffer);
};
