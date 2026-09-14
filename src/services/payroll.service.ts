import { Types } from "mongoose";
import Attendance from "../models/attendance.model";
import { payrollPeriod } from "./payroll-period";
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

/**
 * Overtime (§5). Indian practice pays overtime on BASIC at twice the ordinary
 * rate, over a standard 26 paid days of 8 hours. The multiplier is passed per
 * run so HR can change it once they confirm their policy (spec §17 lists
 * overtime rules as still owed) without a code change.
 */
const OT_STANDARD_DAYS = 26;
const OT_STANDARD_DAY_HOURS = 8;
export const OT_DEFAULT_MULTIPLIER = 2;

export interface AttendanceSummary {
  totalDays: number; // calendar days in the month (proration denominator)
  // Days the employee was actually on the rolls this month — the month
  // clipped to [joiningDate, exitDate]. Equals totalDays for anyone employed
  // for the whole month; smaller for a mid-month joiner or leaver.
  serviceDays: number;
  // In-service days with NO attendance row at all. These are paid (see below),
  // so payroll surfaces the number rather than hiding it.
  unmarkedDays: number;
  presentDays: number;
  /** Sum of computed working minutes across the month (§5). */
  workedMinutes: number;
  /** Sum of approved overtime minutes across the month (§5). */
  overtimeMinutes: number;
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

/** Local midnight for a date-ish input. */
const dayStart = (input: Date | string): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

const DAY_MS = 86400000;

/**
 * Build an attendance summary for an employee + month from the Attendance
 * collection. Days with no record are treated as paid (assumed working/holiday)
 * — only an explicit `absent` or unpaid `leave` row costs the employee pay.
 * The count of such days is returned as `unmarkedDays` so payroll can warn
 * instead of silently paying a month nobody ever marked.
 *
 * `unpaidLeaveRequestIds` lets the caller pre-resolve which `leave` rows belong
 * to an unpaid leave type (the attendance row only stores the request id), so
 * those days count as LOP.
 *
 * `service` clips the month to the employment window: a mid-month joiner or
 * leaver is only paid for the days they were actually on the rolls. Days
 * outside that window are neither paid nor LOP — the person simply wasn't
 * employed, so they never enter the calculation.
 */
export const buildAttendanceSummary = async (
  subjectId: Types.ObjectId | string,
  month: number,
  year: number,
  unpaidLeaveRequestIds: Set<string> = new Set(),
  subjectType: "hr_employee" | "ambulance_staff" = "hr_employee",
  service: { joiningDate?: Date | string; exitDate?: Date | string } = {},
  /**
   * Day of the month the payroll cycle begins. 1 is a calendar month; 16 gives
   * the hospital's 16th-to-15th period. Passed in rather than read here so one
   * run resolves the setting once.
   */
  cycleStartDay = 1,
): Promise<AttendanceSummary> => {
  // The period, which is NOT the calendar month once the cycle starts on the
  // 16th. The proration denominator, the attendance window and the service
  // clipping below all work from it.
  const period = payrollPeriod(month, year, cycleStartDay);
  const total = period.totalDays;
  const monthStart = period.start;
  const monthEnd = dayStart(period.end);

  // Clip to the employment window.
  const joined = service.joiningDate ? dayStart(service.joiningDate) : null;
  const exited = service.exitDate ? dayStart(service.exitDate) : null;
  const svcStart = joined && joined > monthStart ? joined : monthStart;
  const svcEnd = exited && exited < monthEnd ? exited : monthEnd;
  const serviceDays =
    svcEnd < svcStart
      ? 0 // joined after this month ended, or left before it began
      : Math.round((svcEnd.getTime() - svcStart.getTime()) / DAY_MS) + 1;

  const start = svcStart;
  const end = new Date(svcEnd.getTime());
  end.setHours(23, 59, 59, 999);

  const subjectFilter =
    subjectType === "ambulance_staff"
      ? { ambulanceStaffId: subjectId }
      : { employeeId: subjectId };
  const rows = await Attendance.find({
    ...subjectFilter,
    date: { $gte: start, $lte: end },
  }).lean();

  let presentDays = 0;
  let halfDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayDays = 0;
  let weekOffDays = 0;
  let absentDays = 0;
  let workedMinutes = 0;
  let overtimeMinutes = 0;

  for (const r of rows) {
    workedMinutes += r.workedMinutes || 0;
    overtimeMinutes += r.overtimeMinutes || 0;
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

  // In-service days with no attendance record at all → assume paid (working
  // day). Counted separately so the caller can flag an unmarked month rather
  // than paying it in full without comment.
  const unmarkedDays = Math.max(0, serviceDays - rows.length);

  // LOP = full absent days + unpaid leave days + half of half-days. Capped at
  // the service window so LOP can never exceed the days actually worked.
  const lopDays = Math.min(
    serviceDays,
    absentDays + unpaidLeaveDays + halfDays * 0.5,
  );
  const paidDays = Math.max(0, serviceDays - lopDays);

  return {
    totalDays: total,
    serviceDays,
    unmarkedDays,
    workedMinutes,
    overtimeMinutes,
    // Days actually marked present; unmarked days are reported on their own
    // line rather than being folded in here as if someone had marked them.
    presentDays,
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
  serviceDays: number;
  unmarkedDays: number;
  paidDays: number;
  lopDays: number;
  leaveDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  earnings: {
    basic: number;
    hra: number;
    conveyance: number;
    medical: number;
    specialAllowance: number;
    otherAllowances: number;
    /** Paid overtime for the month (§5). Excluded from PF, included in ESI. */
    overtime: number;
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
  opts: {
    tds?: number;
    otherDeduction?: number;
    /** Overtime rate multiplier; defaults to the statutory 2x on basic. */
    overtimeMultiplier?: number;
  } = {},
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
  // Overtime is paid on FULL basic (not the prorated figure): the hourly rate
  // is a property of the wage, not of how many days happened to be worked.
  const otHourlyRate =
    (salary.basic || 0) / (OT_STANDARD_DAYS * OT_STANDARD_DAY_HOURS);
  const otMultiplier = opts.overtimeMultiplier ?? OT_DEFAULT_MULTIPLIER;
  const overtimePay = round(
    (summary.overtimeMinutes / 60) * otHourlyRate * otMultiplier,
  );

  const earnings = {
    basic: round((salary.basic || 0) * ratio),
    hra: round((salary.hra || 0) * ratio),
    conveyance: round((salary.conveyance || 0) * ratio),
    medical: round((salary.medical || 0) * ratio),
    specialAllowance: round((salary.specialAllowance || 0) * ratio),
    otherAllowances: round(otherAllowFull * ratio),
    overtime: overtimePay,
    gross: 0,
  };
  // Earnings the prorating applies to — overtime is extra on top and must not
  // inflate the LOP line, which measures what proration took away.
  const proratedGross = round(
    earnings.basic +
      earnings.hra +
      earnings.conveyance +
      earnings.medical +
      earnings.specialAllowance +
      earnings.otherAllowances,
  );
  earnings.gross = round(proratedGross + overtimePay);

  // LOP as an explicit line = full gross - the prorated part of earned gross.
  const lop = round(fullGross - proratedGross);

  // PF on (prorated) basic, capped at the wage ceiling.
  const pf = salary.pfApplicable
    ? round(Math.min(earnings.basic, PF_WAGE_CEILING) * PF_RATE)
    : 0;
  const pfCapped = Math.min(pf, PF_MAX);

  // ESI: ELIGIBILITY is a property of the wage the employee is engaged on, not
  // of what a particular month happened to pay out — so it is tested against
  // full monthly gross. The CONTRIBUTION is then charged on wages actually
  // earned. Testing eligibility on earned gross (as this did) meant a heavy-LOP
  // month dragged an above-ceiling employee under the ceiling and started
  // deducting ESI from someone who is not an ESI member at all.
  // Contribution is on wages actually paid, overtime included.
  const esi =
    salary.esiApplicable && fullGross <= ESI_GROSS_CEILING
      ? round(earnings.gross * ESI_EMPLOYEE_RATE)
      : 0;

  // Professional tax — flat, keyed off the contractual wage for the same
  // reason: LOP should not turn a PT-liable employee into an exempt one.
  const professionalTax =
    salary.ptApplicable && fullGross >= PT_EXEMPT_BELOW ? PT_AMOUNT : 0;

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
    serviceDays: summary.serviceDays,
    unmarkedDays: round(summary.unmarkedDays),
    workedMinutes: Math.round(summary.workedMinutes),
    overtimeMinutes: Math.round(summary.overtimeMinutes),
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
