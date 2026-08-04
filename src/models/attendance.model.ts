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

export type AttendanceSubject = "hr_employee" | "ambulance_staff";

export interface IAttendance {
  _id: Types.ObjectId;
  subjectType: AttendanceSubject;
  employeeId?: Types.ObjectId; // HrEmployee (hr_employee)
  ambulanceStaffId?: Types.ObjectId; // AmbulanceStaff (ambulance_staff)
  date: Date; // normalized to 00:00
  status: AttendanceStatus;
  checkIn?: string; // "HH:mm"
  checkOut?: string; // "HH:mm"
  leaveRequestId?: Types.ObjectId;
  remarks?: string;
  markedByAdminId?: Types.ObjectId;
  // Selfie + geofence result captured at check-in time (ambulance_staff
  // self-checkin via duty-on toggle only — see ambulance-staff.controller.ts
  // #setDuty; hr_employee rows stay admin-marked with no photo).
  checkInPhoto?: string;
  checkInLocation?: { lat: number; lng: number };
  checkInWithinGeofence?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    subjectType: {
      type: String,
      enum: ["hr_employee", "ambulance_staff"],
      default: "hr_employee",
      index: true,
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "HrEmployee", index: true },
    ambulanceStaffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", index: true },
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
    checkInPhoto: String,
    checkInLocation: {
      lat: Number,
      lng: Number,
    },
    checkInWithinGeofence: Boolean,
  },
  { timestamps: true },
);

// Per-subject uniqueness per day (sparse so the unused id doesn't collide).
AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true, sparse: true });
AttendanceSchema.index({ ambulanceStaffId: 1, date: 1 }, { unique: true, sparse: true });

export const Attendance = mongoose.model<IAttendance>(
  "Attendance",
  AttendanceSchema,
);

export default Attendance;
