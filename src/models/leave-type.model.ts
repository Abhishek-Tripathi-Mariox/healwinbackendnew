import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Leave type master (e.g. Casual, Sick, Earned).
 * `isPaid` decides whether approved days of this type count as paid in payroll.
 */

export interface ILeaveType {
  _id: Types.ObjectId;
  name: string;
  code: string; // e.g. CL, SL, EL
  annualQuota: number; // days allocated per year
  isPaid: boolean;
  /**
   * How the year's quota becomes available.
   *
   * "annual" grants the whole quota on 1 January (or on joining, pro-rata).
   * "monthly" accrues 1/12 each completed month, which is how earned leave
   * normally works — someone four months in has not earned a year of it.
   */
  accrual: "annual" | "monthly";
  /** Unused days may roll into next year. */
  carryForward: boolean;
  /** Cap on what rolls over. 0 with carryForward on means uncapped. */
  maxCarryForward: number;
  color?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveTypeSchema = new Schema<ILeaveType>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    annualQuota: { type: Number, default: 0 },
    isPaid: { type: Boolean, default: true },
    accrual: { type: String, enum: ["annual", "monthly"], default: "annual" },
    carryForward: { type: Boolean, default: false },
    maxCarryForward: { type: Number, default: 0, min: 0 },
    color: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const LeaveType = mongoose.model<ILeaveType>("LeaveType", LeaveTypeSchema);

export default LeaveType;
