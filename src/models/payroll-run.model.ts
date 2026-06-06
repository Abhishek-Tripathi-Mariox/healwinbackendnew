import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Payroll run. One document = one month's payroll batch. Holds the
 * roll-up totals; the per-employee detail lives in Payslip documents that
 * reference this run. A run starts as `draft` (re-generatable) and is locked
 * once `finalized`.
 */

export type PayrollRunStatus = "draft" | "finalized";

export interface IPayrollRun {
  _id: Types.ObjectId;
  month: number; // 1-12
  year: number;
  status: PayrollRunStatus;
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  runByAdminId: Types.ObjectId;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollRunSchema = new Schema<IPayrollRun>(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
      index: true,
    },
    employeeCount: { type: Number, default: 0 },
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
    runByAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    finalizedAt: Date,
  },
  { timestamps: true },
);

PayrollRunSchema.index({ year: 1, month: 1 }, { unique: true });

export const PayrollRun = mongoose.model<IPayrollRun>(
  "PayrollRun",
  PayrollRunSchema,
);

export default PayrollRun;
