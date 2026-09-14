import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Payslip. One document = one employee for one month. Earnings and
 * deductions are stored fully expanded (a snapshot at run time) so a payslip
 * is reproducible even after the employee's salary structure later changes.
 * The {employeeId, month, year} unique index keeps a single payslip per cycle.
 */

export interface IPayslipEarnings {
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  otherAllowances: number;
  overtime: number;
  gross: number;
}

export interface IPayslipDeductions {
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  lop: number;
  other: number;
  total: number;
}

export interface IPayslip {
  _id: Types.ObjectId;
  runId: Types.ObjectId;
  subjectType: "hr_employee" | "ambulance_staff";
  employeeId?: Types.ObjectId;
  ambulanceStaffId?: Types.ObjectId;
  month: number;
  year: number;
  /** Human label of the period, e.g. "16 Sep 2026 – 15 Oct 2026". */
  periodLabel?: string;
  // Snapshot for stable display / PDF.
  employeeCode: string;
  employeeName: string;
  designation?: string;
  // Attendance basis.
  totalDays: number;
  // Days on the rolls this month (the month clipped to joining/exit dates) and
  // how many of those carried no attendance record — a payslip should show
  // what it was computed from, including what was assumed.
  serviceDays: number;
  unmarkedDays: number;
  /** Working-hours roll-up for the month (§5). */
  workedMinutes: number;
  overtimeMinutes: number;
  overtimeAmount: number;
  paidDays: number;
  lopDays: number;
  leaveDays: number;
  earnings: IPayslipEarnings;
  deductions: IPayslipDeductions;
  netPay: number;
  status: "draft" | "verified" | "finalized";
  createdAt: Date;
  updatedAt: Date;
}

const EarningsSchema = new Schema<IPayslipEarnings>(
  {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medical: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    gross: { type: Number, default: 0 },
  },
  { _id: false },
);

const DeductionsSchema = new Schema<IPayslipDeductions>(
  {
    pf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    lop: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const PayslipSchema = new Schema<IPayslip>(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "PayrollRun",
      required: true,
      index: true,
    },
    subjectType: {
      type: String,
      enum: ["hr_employee", "ambulance_staff"],
      default: "hr_employee",
      index: true,
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "HrEmployee", index: true },
    ambulanceStaffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", index: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    periodLabel: String,
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    designation: String,
    totalDays: { type: Number, default: 0 },
    serviceDays: { type: Number, default: 0 },
    unmarkedDays: { type: Number, default: 0 },
    workedMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    earnings: { type: EarningsSchema, default: () => ({}) },
    deductions: { type: DeductionsSchema, default: () => ({}) },
    netPay: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "verified", "finalized"],
      default: "draft",
    },
  },
  { timestamps: true },
);

/**
 * One payslip per subject per cycle.
 *
 * These must be PARTIAL, not sparse. A payslip carries exactly one of
 * `employeeId` (HR employee) or `ambulanceStaffId` (crew) and the other is
 * written as null — and a sparse index skips only ABSENT fields, not null
 * ones. Under `sparse` the second HR-employee payslip in a month collided
 * with the first on {ambulanceStaffId: null, month, year}, so payroll could
 * never process more than one employee.
 *
 * `$type: "objectId"` indexes only the rows where the id is really set.
 *
 * Changing an index declaration does NOT alter an index that already exists
 * in the database — run `npm run migrate:payslip-indexes` to replace them.
 */
PayslipSchema.index(
  { employeeId: 1, month: 1, year: 1 },
  {
    unique: true,
    partialFilterExpression: { employeeId: { $type: "objectId" } },
  },
);
PayslipSchema.index(
  { ambulanceStaffId: 1, month: 1, year: 1 },
  {
    unique: true,
    partialFilterExpression: { ambulanceStaffId: { $type: "objectId" } },
  },
);

export const Payslip = mongoose.model<IPayslip>("Payslip", PayslipSchema);

export default Payslip;
