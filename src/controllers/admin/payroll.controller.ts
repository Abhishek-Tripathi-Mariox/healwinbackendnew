import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { PayrollRun } from "../../models/payroll-run.model";
import { Payslip } from "../../models/payslip.model";
import { LeaveType } from "../../models/leave-type.model";
import { LeaveRequest } from "../../models/leave-request.model";
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

  let run = await PayrollRun.findOne({ month, year });
  if (run && run.status === "finalized") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "this payroll run is finalized and cannot be re-run" };
    return next();
  }

  // Resolve unpaid leave-request ids that overlap this month (so unpaid leave
  // days are treated as LOP by the attendance summary).
  const unpaidTypes = await LeaveType.find({ isPaid: false }).select("_id").lean();
  const unpaidTypeIds = unpaidTypes.map((t) => t._id);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
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

  const employees = await HrEmployee.find({
    isDeleted: false,
    status: { $ne: "terminated" },
  }).lean();

  if (!run) {
    run = await PayrollRun.create({
      month,
      year,
      status: "draft",
      runByAdminId: adminId,
    });
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const emp of employees) {
    const summary = await buildAttendanceSummary(
      emp._id,
      month,
      year,
      unpaidReqIds,
    );
    const computed = computePayslip(salaryOf(emp), summary, {
      tds: tdsMap[String(emp._id)] || 0,
    });

    totalGross += computed.earnings.gross;
    totalDeductions += computed.deductions.total;
    totalNet += computed.netPay;

    await Payslip.findOneAndUpdate(
      { employeeId: emp._id, month, year },
      {
        $set: {
          runId: run._id,
          subjectType: "hr_employee",
          employeeId: emp._id,
          month,
          year,
          employeeCode: emp.employeeCode,
          employeeName: emp.fullName,
          totalDays: computed.totalDays,
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
    const summary = await buildAttendanceSummary(s._id, month, year, unpaidReqIds, "ambulance_staff");
    const computed = computePayslip(s.salaryStructure, summary, { tds: tdsMap[String(s._id)] || 0 });
    totalGross += computed.earnings.gross;
    totalDeductions += computed.deductions.total;
    totalNet += computed.netPay;
    await Payslip.findOneAndUpdate(
      { ambulanceStaffId: s._id, month, year },
      {
        $set: {
          runId: run._id,
          subjectType: "ambulance_staff",
          ambulanceStaffId: s._id,
          month,
          year,
          employeeCode: s.role === "attendant" ? "ATT" : "DRV",
          employeeName: s.fullName,
          designation: s.role === "attendant" ? "Ambulance Attendant" : "Ambulance Driver",
          totalDays: computed.totalDays,
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
  await run.save();

  req.rData = { run };
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

export const finalize = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const run = await PayrollRun.findById(req.params.id);
  if (!run) {
    req.rCode = 5;
    req.msg = "payrun_not_found";
    req.rData = {};
    return next();
  }
  run.status = "finalized";
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
