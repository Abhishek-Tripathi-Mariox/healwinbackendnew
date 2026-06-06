import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Attendance. One document = one employee on one calendar day.
 *
 * `date` is normalized to local midnight so the {employeeId, date} unique
 * index makes marking idempotent — re-marking a day updates the same row
 * instead of creating duplicates. Paid vs unpaid days for payroll are derived
 * from `status` (see payroll.service).
 */

export type AttendanceStatus =
  | "present"
  | "absent"
  | "half_day"
  | "leave"
  | "holiday"
  | "week_off";

export interface IAttendance {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  date: Date; // normalized to 00:00
  status: AttendanceStatus;
  checkIn?: string; // "HH:mm"
  checkOut?: string; // "HH:mm"
  leaveRequestId?: Types.ObjectId;
  remarks?: string;
  markedByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "HrEmployee",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["present", "absent", "half_day", "leave", "holiday", "week_off"],
      required: true,
    },
    checkIn: String,
    checkOut: String,
    leaveRequestId: { type: Schema.Types.ObjectId, ref: "LeaveRequest" },
    remarks: { type: String, trim: true },
    markedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model<IAttendance>(
  "Attendance",
  AttendanceSchema,
);

export default Attendance;
