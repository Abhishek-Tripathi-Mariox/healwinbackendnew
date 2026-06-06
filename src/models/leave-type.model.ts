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
    color: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const LeaveType = mongoose.model<ILeaveType>("LeaveType", LeaveTypeSchema);

export default LeaveType;
