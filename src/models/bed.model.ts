import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Bed (IPD bed-occupancy master).
 *
 * A bed belongs to a ward and is either available or occupied. When occupied,
 * `currentAdmissionId` points at the live admission so the ward board can show
 * who is in each bed. Occupancy is flipped by the admission controller on
 * admit / transfer / discharge.
 */

export interface IBed {
  _id: Types.ObjectId;
  ward: string;
  bedNumber: string;
  bedType?: "general" | "semi_private" | "private" | "icu" | "emergency";
  dailyCharge?: number;
  status: "available" | "occupied" | "maintenance";
  currentAdmissionId?: Types.ObjectId | null;
  isActive: boolean;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BedSchema = new Schema<IBed>(
  {
    ward: { type: String, required: true, trim: true, index: true },
    bedNumber: { type: String, required: true, trim: true },
    bedType: {
      type: String,
      enum: ["general", "semi_private", "private", "icu", "emergency"],
      default: "general",
    },
    dailyCharge: Number,
    status: {
      type: String,
      enum: ["available", "occupied", "maintenance"],
      default: "available",
      index: true,
    },
    currentAdmissionId: {
      type: Schema.Types.ObjectId,
      ref: "Admission",
      default: null,
    },
    isActive: { type: Boolean, default: true },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// A ward can't have two beds with the same number.
BedSchema.index({ ward: 1, bedNumber: 1 }, { unique: true });

export const Bed = mongoose.model<IBed>("Bed", BedSchema);

export default Bed;
