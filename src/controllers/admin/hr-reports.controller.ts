import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { LeaveBalance } from "../../models/leave-balance.model";
import { PayrollRun } from "../../models/payroll-run.model";
import { Payslip } from "../../models/payslip.model";
import EmployeeShift from "../../models/employee-shift.model";
import Holiday from "../../models/holiday.model";
import { buildAttendanceSummary, daysInMonth } from "../../services/payroll.service";
import { formatDuration } from "../../services/working-hours";
import { getCycleStartDay } from "../../services/payroll-settings.service";

/**
 * HR — Reports & data (§13).
 *
 * Every report returns flat ROWS plus a `columns` list naming them in order.
 * The admin panel renders that as a table and turns the same payload into a
 * CSV, so a new report needs no front-end work and the screen and the export
 * can never drift apart.
 */

type Row = Record<string, string | number>;
interface Report {
  title: string;
  columns: { key: string; label: string }[];
  rows: Row[];
}

const parseMonthYear = (req: Request) => ({
  month: parseInt(
    (req.query.month as string) || String(new Date().getMonth() + 1),
    10,
  ),
  year: parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  ),
});

const catLabel = (c?: string) =>
  c ? c.charAt(0).toUpperCase() + c.slice(1) : "—";

/** GET /admin/hr/reports/employees — employee master data. */
export const employees = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const query: any = { isDeleted: false };
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.category) query.category = String(req.query.category);
  if (req.query.departmentId) query.departmentId = req.query.departmentId;

  const items: any[] = await HrEmployee.find(query)
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .populate("employmentTypeId", "name")
    .populate("defaultShiftId", "name code")
    .sort({ fullName: 1 })
    .lean();

  const report: Report = {
    title: "Employee Master",
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "fullName", label: "Name" },
      { key: "category", label: "Category" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "employmentType", label: "Employment Type" },
      { key: "shift", label: "Default Shift" },
      { key: "phone", label: "Mobile" },
      { key: "email", label: "Email" },
      { key: "joiningDate", label: "Joining Date" },
      { key: "status", label: "Status" },
      { key: "ctcAnnual", label: "Annual CTC" },
    ],
    rows: items.map((e) => ({
      employeeCode: e.employeeCode || "",
      fullName: e.fullName || "",
      category: catLabel(e.category),
      department: e.departmentId?.name || "—",
      designation: e.designationId?.name || "—",
      employmentType: e.employmentTypeId?.name || "—",
      shift: e.defaultShiftId?.name || "—",
      phone: e.phone || "",
      email: e.email || "",
      joiningDate: e.joiningDate
        ? new Date(e.joiningDate).toLocaleDateString("en-IN")
        : "",
      status: e.status || "",
      ctcAnnual: e.salaryStructure?.ctcAnnual || 0,
    })),
  };
  req.rData = report;
  req.msg = "success";
  return next();
};

/** GET /admin/hr/reports/attendance?month=&year=&departmentId= */
export const attendance = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { month, year } = parseMonthYear(req);
  const query: any = { isDeleted: false, status: { $ne: "terminated" } };
  if (req.query.departmentId) query.departmentId = req.query.departmentId;
  if (req.query.category) query.category = String(req.query.category);

  const emps: any[] = await HrEmployee.find(query)
    .select("fullName employeeCode category joiningDate exitDate departmentId")
    .populate("departmentId", "name")
    .sort({ fullName: 1 })
    .lean();

  const cycleStartDay = await getCycleStartDay();
  const rows: Row[] = [];
  for (const e of emps) {
    // Same cycle as payroll — a report that counted calendar months while
    // payroll paid 16th-to-15th would disagree with the payslips it is meant
    // to explain.
    const s = await buildAttendanceSummary(
      e._id,
      month,
      year,
      new Set(),
      "hr_employee",
      { joiningDate: e.joiningDate, exitDate: e.exitDate },
      cycleStartDay,
    );
    rows.push({
      employeeCode: e.employeeCode || "",
      fullName: e.fullName || "",
      department: e.departmentId?.name || "—",
      category: catLabel(e.category),
      serviceDays: s.serviceDays,
      present: s.presentDays,
      absent: s.absentDays,
      halfDays: s.halfDays,
      leave: s.paidLeaveDays + s.unpaidLeaveDays,
      holiday: s.holidayDays,
      weekOff: s.weekOffDays,
      unmarked: s.unmarkedDays,
      worked: formatDuration(s.workedMinutes),
      overtime: formatDuration(s.overtimeMinutes),
      paidDays: s.paidDays,
      lop: s.lopDays,
    });
  }

  req.rData = {
    title: `Attendance — ${month}/${year}`,
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "fullName", label: "Name" },
      { key: "department", label: "Department" },
      { key: "category", label: "Category" },
      { key: "serviceDays", label: "On Rolls" },
      { key: "present", label: "Present" },
      { key: "absent", label: "Absent" },
      { key: "halfDays", label: "Half Days" },
      { key: "leave", label: "Leave" },
      { key: "holiday", label: "Holiday" },
      { key: "weekOff", label: "Week Off" },
      { key: "unmarked", label: "Unmarked" },
      { key: "worked", label: "Hours Worked" },
      { key: "overtime", label: "Overtime" },
      { key: "paidDays", label: "Paid Days" },
      { key: "lop", label: "LOP" },
    ],
    rows,
  };
  req.msg = "success";
  return next();
};

/** GET /admin/hr/reports/leave?year=&status= */
export const leave = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  const query: any = { fromDate: { $lte: end }, toDate: { $gte: start } };
  if (req.query.status) query.status = String(req.query.status);

  const items: any[] = await LeaveRequest.find(query)
    .populate("employeeId", "fullName employeeCode")
    .populate("ambulanceStaffId", "fullName role")
    .populate("leaveTypeId", "name code isPaid")
    .sort({ fromDate: -1 })
    .limit(2000)
    .lean();

  req.rData = {
    title: `Leave — ${year}`,
    columns: [
      { key: "subject", label: "Employee" },
      { key: "ref", label: "Code" },
      { key: "type", label: "Leave Type" },
      { key: "paid", label: "Paid" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "days", label: "Days" },
      { key: "status", label: "Status" },
      { key: "reason", label: "Reason" },
    ],
    rows: items.map((lr) => ({
      subject:
        lr.subjectType === "ambulance_staff"
          ? lr.ambulanceStaffId?.fullName || "Ambulance staff"
          : lr.employeeId?.fullName || "Employee",
      ref:
        lr.subjectType === "ambulance_staff"
          ? lr.ambulanceStaffId?.role || "crew"
          : lr.employeeId?.employeeCode || "",
      type: lr.leaveTypeId?.name || lr.leaveTypeName || "Leave",
      paid: lr.leaveTypeId ? (lr.leaveTypeId.isPaid ? "Yes" : "No") : "—",
      from: new Date(lr.fromDate).toLocaleDateString("en-IN"),
      to: new Date(lr.toDate).toLocaleDateString("en-IN"),
      days: lr.days,
      status: lr.status,
      reason: lr.reason || "",
    })),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/hr/reports/leave-balances?year= */
export const leaveBalances = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );
  const items: any[] = await LeaveBalance.find({ year })
    .populate("employeeId", "fullName employeeCode")
    .populate("leaveTypeId", "name code")
    .lean();

  req.rData = {
    title: `Leave Balances — ${year}`,
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "fullName", label: "Name" },
      { key: "type", label: "Leave Type" },
      { key: "allocated", label: "Allocated" },
      { key: "used", label: "Used" },
      { key: "balance", label: "Balance" },
    ],
    rows: items.map((b) => ({
      employeeCode: b.employeeId?.employeeCode || "",
      fullName: b.employeeId?.fullName || "",
      type: b.leaveTypeId?.name || "",
      allocated: b.allocated,
      used: b.used,
      balance: b.balance,
    })),
  };
  req.msg = "success";
  return next();
};

/**
 * GET /admin/hr/reports/payroll?month=&year=
 * The monthly salary sheet — one row per person, every component spelled out.
 */
export const payroll = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { month, year } = parseMonthYear(req);
  const run = await PayrollRun.findOne({ month, year }).lean();
  if (!run) {
    req.rCode = 5;
    req.msg = "payrun_not_found";
    req.rData = { hint: `no payroll run exists for ${month}/${year}` };
    return next();
  }
  const slips: any[] = await Payslip.find({ runId: run._id })
    .sort({ employeeName: 1 })
    .lean();

  req.rData = {
    title: `Payroll Sheet — ${month}/${year}`,
    run: {
      status: run.status,
      employeeCount: run.employeeCount,
      totalGross: run.totalGross,
      totalDeductions: run.totalDeductions,
      totalNet: run.totalNet,
      totalOvertimeAmount: run.totalOvertimeAmount,
    },
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "employeeName", label: "Name" },
      { key: "designation", label: "Designation" },
      { key: "totalDays", label: "Month Days" },
      { key: "serviceDays", label: "On Rolls" },
      { key: "paidDays", label: "Paid Days" },
      { key: "lopDays", label: "LOP" },
      { key: "overtimeHours", label: "OT Hours" },
      { key: "basic", label: "Basic" },
      { key: "hra", label: "HRA" },
      { key: "conveyance", label: "Conveyance" },
      { key: "medical", label: "Medical" },
      { key: "specialAllowance", label: "Special Allowance" },
      { key: "otherAllowances", label: "Other Allowances" },
      { key: "overtime", label: "Overtime" },
      { key: "gross", label: "Gross" },
      { key: "pf", label: "PF" },
      { key: "esi", label: "ESI" },
      { key: "professionalTax", label: "PT" },
      { key: "tds", label: "TDS" },
      { key: "otherDeduction", label: "Other Deduction" },
      { key: "totalDeductions", label: "Total Deductions" },
      { key: "netPay", label: "Net Pay" },
    ],
    rows: slips.map((p) => ({
      employeeCode: p.employeeCode || "",
      employeeName: p.employeeName || "",
      designation: p.designation || "",
      totalDays: p.totalDays || 0,
      serviceDays: p.serviceDays || 0,
      paidDays: p.paidDays || 0,
      lopDays: p.lopDays || 0,
      overtimeHours: Math.round(((p.overtimeMinutes || 0) / 60) * 100) / 100,
      basic: p.earnings?.basic || 0,
      hra: p.earnings?.hra || 0,
      conveyance: p.earnings?.conveyance || 0,
      medical: p.earnings?.medical || 0,
      specialAllowance: p.earnings?.specialAllowance || 0,
      otherAllowances: p.earnings?.otherAllowances || 0,
      overtime: p.earnings?.overtime || 0,
      gross: p.earnings?.gross || 0,
      pf: p.deductions?.pf || 0,
      esi: p.deductions?.esi || 0,
      professionalTax: p.deductions?.professionalTax || 0,
      tds: p.deductions?.tds || 0,
      otherDeduction: p.deductions?.other || 0,
      totalDeductions: p.deductions?.total || 0,
      netPay: p.netPay || 0,
    })),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/hr/reports/shifts?date= — who is on which shift. */
export const shifts = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const date =
    (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const items: any[] = await EmployeeShift.find({ date })
    .populate("employeeId", "fullName employeeCode category")
    .populate("workShiftId", "name code startTime endTime")
    .sort({ shift: 1 })
    .lean();

  req.rData = {
    title: `Shift Roster — ${date}`,
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "fullName", label: "Name" },
      { key: "category", label: "Category" },
      { key: "shift", label: "Shift" },
      { key: "timing", label: "Timing" },
      { key: "section", label: "Section" },
    ],
    rows: items.map((s) => ({
      employeeCode: s.employeeId?.employeeCode || "",
      fullName: s.employeeId?.fullName || "",
      category: catLabel(s.employeeId?.category),
      shift: s.workShiftId?.name || s.shift || "",
      timing:
        s.workShiftId?.startTime && s.workShiftId?.endTime
          ? `${s.workShiftId.startTime}–${s.workShiftId.endTime}`
          : [s.startTime, s.endTime].filter(Boolean).join("–") || "—",
      section: s.section || s.department || "—",
    })),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/hr/reports/holidays?year= */
export const holidays = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );
  const items = await Holiday.find({ year }).sort({ date: 1 }).lean();
  req.rData = {
    title: `Holiday Calendar — ${year}`,
    columns: [
      { key: "date", label: "Date" },
      { key: "day", label: "Day" },
      { key: "name", label: "Holiday" },
      { key: "type", label: "Type" },
      { key: "active", label: "Active" },
    ],
    rows: items.map((h) => ({
      date: new Date(h.date).toLocaleDateString("en-IN"),
      day: new Date(h.date).toLocaleDateString("en-IN", { weekday: "long" }),
      name: h.name,
      type: h.type,
      active: h.isActive ? "Yes" : "No",
    })),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/hr/reports/monthly-days?month=&year= — days in the month. */
export const monthDays = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { month, year } = parseMonthYear(req);
  req.rData = { month, year, days: daysInMonth(month, year) };
  req.msg = "success";
  return next();
};
