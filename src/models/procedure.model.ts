import mongoose, { Schema, Types } from "mongoose";

/**
 * Procedure rate list (dressing, suturing, minor surgery, catheterization,
 * etc.) — the real price catalog a doctor picks from when documenting a
 * procedure performed during an encounter, instead of billing staff typing
 * a flat amount after the fact. Managed from the admin panel, mirrors
 * LabTest/PharmacyProduct's catalog shape. See EmrEncounter.procedures and
 * billing.controller.ts's real procedure-line pull.
 */
export interface IProcedure {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  category?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProcedureSchema = new Schema<IProcedure>(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, default: 0 },
    category: { type: String, trim: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

ProcedureSchema.index({ name: "text" });

export const Procedure = mongoose.model<IProcedure>("Procedure", ProcedureSchema);
export default Procedure;
