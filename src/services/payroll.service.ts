import { Types } from "mongoose";
import Attendance from "../models/attendance.model";
import { IHrEmployee, ISalaryStructure } from "../models/hr-employee.model";

/**
 * HR — Payroll engine.
 *
 * Computes a month's payslip for one employee from their salary structure plus
 * the month's attendance summary. Statutory rules are encoded as named
 * constants with sensible Indian defaults; per-employee applicability flags on
 * the salary structure (pf/esi/pt) can switch each component off.
 *
 * Out of scope: full income-tax TDS slabs — TDS is passed in as a manual figure
 * (defaults to 0) and simply carried onto the payslip.
 */

// ----- Statutory constants (Indian defaults) -----
const PF_RATE = 0.12; // employee contribution
const PF_WAGE_CEILING = 15000; // PF computed on basic capped at this
const PF_MAX = PF_WAGE_CEILING * PF_RATE; // ₹1,800

const ESI_EMPLOYEE_RATE = 0.0075; // 0.75% of gross
const ESI_GROSS_CEILING = 21000; // ESI applies only at/under this gross

const PT_AMOUNT = 200; // flat professional tax / month
const PT_EXEMPT_BELOW = 15000; // no PT if gross below this

export interface AttendanceSummary {
  totalDays: number; // calendar days in the month
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  weekOffDays: number;
  absentDays: number;
  paidDays: number; // days the employee is paid for
  lopDays: number; // loss-of-pay days
}

/** Number of days in a given month (month is 1-12). */
export const daysInMonth = (month: number, year: number): number =>
  new Date(year, month, 0).getDate();

/**
 * Build an attendance summary for an employee + month from the Attendance
 * collection. Days with no record are treated as paid (assumed working/holiday)
 * — only an explicit `absent` or unpaid `leave` row costs the employee pay.
 *
 * `unpaidLeaveRequestIds` lets the caller pre-resolve which `leave` rows belong
 * to an unpaid leave type (the attendance row only stores the request id), so
 * those days count as LOP.
 */
export const buildAttendanceSummary = async (
  employeeId: Types.ObjectId | string,
  month: number,
  year: number,
  unpaidLeaveRequestIds: Set<string> = new Set(),
): Promise<AttendanceSummary> => {
  const total = daysInMonth(month, year);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month - 1, total, 23, 59, 59, 999);

  const rows = await Attendance.find({
    employeeId,
    date: { $gte: start, $lte: end },
  }).lean();

  let presentDays = 0;
  let halfDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayDays = 0;
  let weekOffDays = 0;
  let absentDays = 0;

  for (const r of rows) {
    switch (r.status) {
      case "present":
        presentDays += 1;
        break;
      case "half_day":
        halfDays += 1;
        break;
      case "holiday":
        holidayDays += 1;
        break;
      case "week_off":
        weekOffDays += 1;
        break;
      case "absent":
        absentDays += 1;
        break;
      case "leave": {
        const unpaid =
          r.leaveRequestId != null &&
          unpaidLeaveRequestIds.has(String(r.leaveRequestId));
        if (unpaid) unpaidLeaveDays += 1;
        else paidLeaveDays += 1;
        break;
      }
      default:
        break;
    }
  }

  // Days with no attendance record at all → assume paid (working day).
  const recorded = rows.length;
  const unrecordedPaid = Math.max(0, total - recorded);

  // LOP = full absent days + unpaid leave days + half of half-days.
  const lopDays = absentDays + unpaidLeaveDays + halfDays * 0.5;
  const paidDays = Math.max(0, total - lopDays);

  return {
    totalDays: total,
    presentDays: presentDays + unrecordedPaid,
    halfDays,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayDays,
    weekOffDays,
    absentDays,
    paidDays,
    lopDays,
  };
};

const round = (n: number): number => Math.round(n * 100) / 100;

export interface ComputedPayslip {
  totalDays: number;
  paidDays: number;
  lopDays: number;
  leaveDays: number;
  earnings: {
    basic: number;
    hra: number;
    conveyance: number;
    medical: number;
    specialAllowance: number;
    otherAllowances: number;
    gross: number;
  };
  deductions: {
    pf: number;
    esi: number;
    professionalTax: number;
    tds: number;
    lop: number;
    other: number;
    total: number;
  };
  netPay: number;
}

/**
 * Compute a payslip from a salary structure + attendance summary.
 * Earnings are prorated by paidDays/totalDays; LOP is surfaced both as the
 * prorated reduction (inside the prorated earnings) and as an explicit `lop`
 * deduction line computed against full monthly gross, so the payslip reads the
 * way Indian payslips do (full earnings, LOP shown as a deduction).
 */
export const computePayslip = (
  salary: ISalaryStructure,
  summary: AttendanceSummary,
  opts: { tds?: number; otherDeduction?: number } = {},
): ComputedPayslip => {
  const { totalDays, paidDays, lopDays } = summary;
  const ratio = totalDays > 0 ? paidDays / totalDays : 1;

  const otherAllowFull = (salary.otherAllowances || []).reduce(
    (s, a) => s + (a.amount || 0),
    0,
  );

  // Full monthly components.
  const fullGross =
    (salary.basic || 0) +
    (salary.hra || 0) +
    (salary.conveyance || 0) +
    (salary.medical || 0) +
    (salary.specialAllowance || 0) +
    otherAllowFull;

  // Prorated (actually-earned) components.
  const earnings = {
    basic: round((salary.basic || 0) * ratio),
    hra: round((salary.hra || 0) * ratio),
    conveyance: round((salary.conveyance || 0) * ratio),
    medical: round((salary.medical || 0) * ratio),
    specialAllowance: round((salary.specialAllowance || 0) * ratio),
    otherAllowances: round(otherAllowFull * ratio),
    gross: 0,
  };
  earnings.gross = round(
    earnings.basic +
      earnings.hra +
      earnings.conveyance +
      earnings.medical +
      earnings.specialAllowance +
      earnings.otherAllowances,
  );

  // LOP as an explicit line = full gross - earned gross.
  const lop = round(fullGross - earnings.gross);

  // PF on (prorated) basic, capped at the wage ceiling.
  const pf = salary.pfApplicable
    ? round(Math.min(earnings.basic, PF_WAGE_CEILING) * PF_RATE)
    : 0;
  const pfCapped = Math.min(pf, PF_MAX);

  // ESI on earned gross, only if within ceiling.
  const esi =
    salary.esiApplicable && earnings.gross <= ESI_GROSS_CEILING
      ? round(earnings.gross * ESI_EMPLOYEE_RATE)
      : 0;

  // Professional tax — flat, unless earned gross below exemption.
  const professionalTax =
    salary.ptApplicable && earnings.gross >= PT_EXEMPT_BELOW ? PT_AMOUNT : 0;

  const tds = round(opts.tds || 0);
  const other = round(opts.otherDeduction || 0);

  const totalDeductions = round(
    pfCapped + esi + professionalTax + tds + other,
  );

  // Net pay = earned gross - statutory/other deductions. (LOP is already
  // reflected in earned gross, so it is shown for transparency but not
  // subtracted again.)
  const netPay = round(earnings.gross - totalDeductions);

  return {
    totalDays,
    paidDays: round(paidDays),
    lopDays: round(lopDays),
    leaveDays: round(summary.paidLeaveDays + summary.unpaidLeaveDays),
    earnings,
    deductions: {
      pf: pfCapped,
      esi,
      professionalTax,
      tds,
      lop,
      other,
      total: totalDeductions,
    },
    netPay,
  };
};

/** Convenience: pull the salary structure off an employee doc safely. */
export const salaryOf = (emp: IHrEmployee): ISalaryStructure =>
  emp.salaryStructure || ({} as ISalaryStructure);
