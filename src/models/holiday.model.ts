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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

HolidaySchema.index({ year: 1, date: 1 });

export const Holiday = mongoose.model<IHoliday>("Holiday", HolidaySchema);

export default Holiday;
