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
  /** Shift this day was worked against — drives hours and overtime (§5). */
  shiftId?: Types.ObjectId;
  /** Computed on save from checkIn/checkOut, minus the shift's break. */
  workedMinutes?: number;
  /** Minutes beyond the shift length, past its overtimeAfterMinutes buffer. */
  overtimeMinutes?: number;
  /** Arrived after startTime + graceMinutes. */
  isLate?: boolean;
  /** Set when an approved regularization rewrote this day. */
  regularizationId?: Types.ObjectId;
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
    shiftId: { type: Schema.Types.ObjectId, ref: "WorkShift" },
    workedMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    isLate: { type: Boolean, default: false },
    regularizationId: {
      type: Schema.Types.ObjectId,
      ref: "AttendanceRegularization",
    },
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
/**
 * One attendance row per person per day — partial, NOT sparse.
 *
 * `sparse` on a COMPOUND index only skips a document missing *every* indexed
 * field. `date` is always present, so an hr_employee row (which has no
 * `ambulanceStaffId`) was still indexed, as `{ ambulanceStaffId: null, date }`
 * — and the second employee marked on any given day collided with the first.
 * The effect was that attendance could not be marked for more than one person
 * per day: the extra rows were rejected, and payroll then treated those days
 * as unmarked and paid them in full on no record.
 *
 * A partial filter on the field's type indexes only the rows that actually
 * carry that subject, which is what was meant all along.
 */
AttendanceSchema.index(
  { employeeId: 1, date: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "objectId" } } },
);
AttendanceSchema.index(
  { ambulanceStaffId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { ambulanceStaffId: { $type: "objectId" } },
  },
);
// The roster reads one day at a time, and filtering it by status resolves who
// was marked that way from here — a day's rows only, never the whole history.
AttendanceSchema.index({ date: 1, subjectType: 1, status: 1 });

export const Attendance = mongoose.model<IAttendance>(
  "Attendance",
  AttendanceSchema,
);

export default Attendance;
