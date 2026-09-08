import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Attendance Regularization (AR).
 *
 * A request to correct one day's attendance, kept as its own document rather
 * than editing the attendance row directly, so there is a record of what was
 * changed, by whom, why, and who approved it. Payroll is computed from
 * attendance, so a silent edit to a past day is a silent edit to someone's
 * pay — the trail is the point.
 *
 * `EMERGENCY` marks the case the spec calls out separately: attendance taken
 * on the paper register during a system or network outage and reconciled
 * afterwards.
 */

export type ARStatus = "pending" | "approved" | "rejected";
export type ARReason =
  | "MISSED_PUNCH"
  | "WRONG_STATUS"
  | "ON_DUTY"
  | "EMERGENCY"
  | "REGISTER_RECONCILIATION"
  | "OTHER";

export interface IAttendanceRegularization {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  date: Date; // normalized to 00:00
  reason: ARReason;
  note?: string;

  /** What attendance said before the request — snapshotted at request time. */
  fromStatus?: string;
  fromCheckIn?: string;
  fromCheckOut?: string;

  /** What it should say. */
  toStatus: string;
  toCheckIn?: string;
  toCheckOut?: string;

  status: ARStatus;
  requestedByAdminId?: Types.ObjectId;
  decidedByAdminId?: Types.ObjectId;
  decisionNote?: string;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ARSchema = new Schema<IAttendanceRegularization>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "HrEmployee",
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    reason: {
      type: String,
      enum: [
        "MISSED_PUNCH",
        "WRONG_STATUS",
        "ON_DUTY",
        "EMERGENCY",
        "REGISTER_RECONCILIATION",
        "OTHER",
      ],
      default: "OTHER",
    },
    note: { type: String, trim: true },

    fromStatus: String,
    fromCheckIn: String,
    fromCheckOut: String,

    toStatus: { type: String, required: true },
    toCheckIn: String,
    toCheckOut: String,

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    requestedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    decidedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    decisionNote: { type: String, trim: true },
    decidedAt: Date,
  },
  { timestamps: true },
);

// One OPEN request per employee-day: a second pending correction for the same
// day would race the first on approval.
ARSchema.index(
  { employeeId: 1, date: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
ARSchema.index({ status: 1, createdAt: -1 });

export const AttendanceRegularization =
  mongoose.model<IAttendanceRegularization>(
    "AttendanceRegularization",
    ARSchema,
  );

export default AttendanceRegularization;
