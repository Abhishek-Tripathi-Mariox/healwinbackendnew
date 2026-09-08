import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Payroll run. One document = one month's payroll batch. Holds the
 * roll-up totals; the per-employee detail lives in Payslip documents that
 * reference this run. A run starts as `draft` (re-generatable) and is locked
 * once `finalized`.
 */

/**
 * draft → verified → finalized.
 *
 * `verified` is the checkpoint the spec asks for: HR reviews the computed
 * sheet and signs it off BEFORE it is locked, so the salary run on the 16th
 * is a deliberate two-person act rather than one irreversible click.
 */
export type PayrollRunStatus = "draft" | "verified" | "finalized";

export interface IPayrollRun {
  _id: Types.ObjectId;
  month: number; // 1-12
  year: number;
  status: PayrollRunStatus;
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalOvertimeAmount: number;
  runByAdminId: Types.ObjectId;
  verifiedByAdminId?: Types.ObjectId;
  verifiedAt?: Date;
  verificationNote?: string;
  finalizedByAdminId?: Types.ObjectId;
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
      enum: ["draft", "verified", "finalized"],
      default: "draft",
      index: true,
    },
    employeeCount: { type: Number, default: 0 },
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
    totalOvertimeAmount: { type: Number, default: 0 },
    runByAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    verifiedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    verifiedAt: Date,
    verificationNote: { type: String, trim: true },
    finalizedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
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
