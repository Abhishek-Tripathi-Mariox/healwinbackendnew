import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Leave request. On approval the leave controller writes `leave`
 * attendance rows across [fromDate, toDate] and decrements the matching
 * LeaveBalance so payroll and the attendance roster stay consistent.
 */

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ILeaveRequest {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  fromDate: Date;
  toDate: Date;
  days: number;
  reason?: string;
  status: LeaveStatus;
  approverAdminId?: Types.ObjectId;
  decisionNote?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveRequestSchema = new Schema<ILeaveRequest>(
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
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    approverAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    decisionNote: { type: String, trim: true },
    decidedAt: Date,
  },
  { timestamps: true },
);

LeaveRequestSchema.index({ status: 1, createdAt: -1 });

export const LeaveRequest = mongoose.model<ILeaveRequest>(
  "LeaveRequest",
  LeaveRequestSchema,
);

export default LeaveRequest;
