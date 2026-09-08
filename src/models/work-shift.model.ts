import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Shift MASTER.
 *
 * Distinct from `EmployeeShift`, which only records "this person works this
 * shift on this date". This is the shift itself: its name, its timings and
 * which departments it applies to. Without a master, timings were typed by
 * hand on every assignment and could not be reported on or reused.
 *
 * Not to be confused with `shift.model.ts`, which belongs to the ambulance
 * fleet (provider + vehicle rostering) and is dispatch-critical.
 *
 * Times are stored as "HH:mm" in local (IST) clock terms rather than as
 * Date objects: a shift is a rule about the working day, not an instant.
 * A shift whose `endTime` is at or before `startTime` crosses midnight —
 * see `isOvernight`, which working-hours calculation depends on.
 */

export interface IWorkShift {
  _id: Types.ObjectId;
  name: string;
  code: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  /** Unpaid break inside the shift, deducted from worked hours. */
  breakMinutes: number;
  /**
   * Departments this shift is offered to. Empty = available to every
   * department (a General shift, typically).
   */
  departmentIds: Types.ObjectId[];
  /** Late arrival tolerated before a day is treated as late. */
  graceMinutes: number;
  /** Worked minutes at or above this count as a full day. */
  fullDayMinutes: number;
  /** Worked minutes at or above this (but under fullDay) count as a half day. */
  halfDayMinutes: number;
  /** Minutes beyond the shift's own length before overtime starts accruing. */
  overtimeAfterMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkShiftSchema = new Schema<IWorkShift>(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    breakMinutes: { type: Number, default: 0 },
    departmentIds: [{ type: Schema.Types.ObjectId, ref: "Department" }],
    graceMinutes: { type: Number, default: 10 },
    fullDayMinutes: { type: Number, default: 480 },
    halfDayMinutes: { type: Number, default: 240 },
    overtimeAfterMinutes: { type: Number, default: 30 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

WorkShiftSchema.index({ departmentIds: 1, isActive: 1 });

export const WorkShift = mongoose.model<IWorkShift>(
  "WorkShift",
  WorkShiftSchema,
);

export default WorkShift;
