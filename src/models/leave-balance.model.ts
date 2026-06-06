import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Per-employee, per-type, per-year leave balance.
 * `balance = allocated - used`, maintained on leave approval/cancellation.
 */

export interface ILeaveBalance {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  year: number;
  allocated: number;
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
    used: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LeaveBalanceSchema.index(
  { employeeId: 1, leaveTypeId: 1, year: 1 },
  { unique: true },
);

export const LeaveBalance = mongoose.model<ILeaveBalance>(
  "LeaveBalance",
  LeaveBalanceSchema,
);

export default LeaveBalance;
