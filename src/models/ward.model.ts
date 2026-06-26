import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Ward master.
 *
 * A ward groups IPD beds (e.g. "General Ward", "ICU", "Maternity"). Beds
 * reference the ward by NAME (Bed.ward is a string), so renaming/deleting a
 * ward here doesn't orphan existing beds — this model is the managed picklist
 * the bed form draws from. Soft-deleted via `isActive` so historical beds keep
 * a valid ward label.
 */

export interface IWard {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WardSchema = new Schema<IWard>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { timestamps: true },
);

export const Ward = mongoose.model<IWard>("Ward", WardSchema);

export default Ward;
