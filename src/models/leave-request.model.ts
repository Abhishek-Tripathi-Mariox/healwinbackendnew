import mongoose, { Schema, Types } from "mongoose";

/**
 * Central leave request — one store for ALL staff types.
 *  - subjectType "hr_employee"   → employeeId (HrEmployee) + leaveTypeId; on
 *    approval writes attendance rows + decrements LeaveBalance (payroll-linked).
 *  - subjectType "ambulance_staff" → ambulanceStaffId (AmbulanceStaff); the
 *    staff app posts these. leaveTypeName carries the free-text type from the
 *    app; attendance/balance are skipped (ambulance crew isn't on HR attendance).
 * The admin HR Leave page lists & approves both in one place.
 */

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveSubject = "hr_employee" | "ambulance_staff";

export interface ILeaveRequest {
  _id: Types.ObjectId;
  subjectType: LeaveSubject;
  employeeId?: Types.ObjectId; // HrEmployee (when hr_employee)
  ambulanceStaffId?: Types.ObjectId; // AmbulanceStaff (when ambulance_staff)
  leaveTypeId?: Types.ObjectId;
  leaveTypeName?: string; // free-text type (ambulance staff app)
  fromDate: Date;
  toDate: Date;
  days: number;
  halfDay?: boolean;
  reason?: string;
  attachmentUrl?: string;
  status: LeaveStatus;
  approverAdminId?: Types.ObjectId;
  decisionNote?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveRequestSchema = new Schema<ILeaveRequest>(
  {
    subjectType: {
      type: String,
      enum: ["hr_employee", "ambulance_staff"],
      default: "hr_employee",
      index: true,
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "HrEmployee", index: true },
    ambulanceStaffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", index: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: "LeaveType" },
    leaveTypeName: { type: String, trim: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true },
    halfDay: { type: Boolean, default: false },
    reason: { type: String, trim: true },
    attachmentUrl: { type: String, trim: true },
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
