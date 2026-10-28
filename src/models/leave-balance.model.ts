import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Per-employee, per-type, per-year leave balance.
 * `balance = allocated + carriedForward - used`, maintained on leave
 * approval/cancellation and restated by the entitlement service.
 */

export interface ILeaveBalance {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  year: number;
  /** Entitlement earned for THIS year — accrued, and pro-rata for joiners. */
  allocated: number;
  /** Unused days rolled in from last year, already capped. */
  carriedForward: number;
  used: number;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "HrEmployee",
      required: true,
      index: true,
    },
    leaveTypeId: {
      type: Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
    },
    year: { type: Number, required: true },
    allocated: { type: Number, default: 0 },
    carriedForward: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/**
 * `balance` is stored, not derived on read, because approvals decrement it
 * inside a transaction — a computed value would race. It is always
 * `allocated + carriedForward - used`; `recomputeBalance` is the one place
 * that restates it.
 */
LeaveBalanceSchema.index(
  { employeeId: 1, leaveTypeId: 1, year: 1 },
  { unique: true },
);

export const LeaveBalance = mongoose.model<ILeaveBalance>(
  "LeaveBalance",
  LeaveBalanceSchema,
);

export default LeaveBalance;
