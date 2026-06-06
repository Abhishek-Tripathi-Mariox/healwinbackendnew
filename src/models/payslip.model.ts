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
  employeeId: Types.ObjectId;
  month: number;
  year: number;
  // Snapshot for stable display / PDF.
  employeeCode: string;
  employeeName: string;
  designation?: string;
  // Attendance basis.
  totalDays: number;
  paidDays: number;
  lopDays: number;
  leaveDays: number;
  earnings: IPayslipEarnings;
  deductions: IPayslipDeductions;
  netPay: number;
  status: "draft" | "finalized";
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
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "HrEmployee",
      required: true,
      index: true,
    },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    designation: String,
    totalDays: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    earnings: { type: EarningsSchema, default: () => ({}) },
    deductions: { type: DeductionsSchema, default: () => ({}) },
    netPay: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
    },
  },
  { timestamps: true },
);

PayslipSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

export const Payslip = mongoose.model<IPayslip>("Payslip", PayslipSchema);

export default Payslip;
