import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Org holiday. Days flagged here are excluded from absent/LOP
 * calculations in attendance and payroll.
 */

export type HolidayType = "public" | "restricted" | "optional";

export interface IHoliday {
  _id: Types.ObjectId;
  name: string;
  date: Date; // normalized to 00:00
  year: number;
  type: HolidayType;
  /**
   * Whether the hospital still runs on this day.
   *
   * A hospital cannot close for a public holiday — wards, ICU and emergency
   * are staffed regardless. So a holiday here does NOT mean "everyone is off":
   * rostered staff work it and HR grants them a compensatory off instead.
   *
   * `true` (the default) — normal working day, no blanket time off written
   * into attendance, comp-off granted to those who worked.
   * `false` — the organisation genuinely closes; attendance is marked
   * `holiday` for everyone, as it was before.
   */
  isWorkingDay: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema = new Schema<IHoliday>(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    year: { type: Number, required: true, index: true },
    type: {
      type: String,
      enum: ["public", "restricted", "optional"],
      default: "public",
    },
    // Defaults to a working day: this is a hospital.
    isWorkingDay: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

HolidaySchema.index({ year: 1, date: 1 });

export const Holiday = mongoose.model<IHoliday>("Holiday", HolidaySchema);

export default Holiday;
