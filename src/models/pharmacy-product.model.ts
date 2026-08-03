import mongoose, { Schema, Types } from "mongoose";

/**
 * Pharmacy product (patient-app "Pharmacy" catalog). Distinct from
 * pharmacy.model (which is the pharmacy *store/listing*). Managed from the
 * admin panel; surfaced read-only to the patient app via
 * /patient/pharmacy/products.
 */
export interface IPharmacyProduct {
  _id: Types.ObjectId;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  mrp?: number;
  image?: string;
  // Legacy stock counter — used only for products with no `itemId` link.
  // Once linked, the real HMS InventoryItem.currentStock is authoritative
  // (see catalog.controller.ts#products.list/detail, which overlays it) and
  // this field is no longer written to directly.
  stock: number;
  // Links this commerce listing to the real HMS stock ledger so a patient
  // checkout draws from the SAME physical stock as EMR/ward dispensing,
  // instead of a second, never-reconciled stock counter.
  itemId?: Types.ObjectId;
  prescriptionRequired: boolean;
  description?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PharmacyProductSchema = new Schema<IPharmacyProduct>(
  {
    name: { type: String, required: true, trim: true, index: true },
    brand: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    price: { type: Number, required: true, default: 0 },
    mrp: Number,
    image: String,
    stock: { type: Number, default: 0 },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    prescriptionRequired: { type: Boolean, default: false },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

PharmacyProductSchema.index({ name: "text", brand: "text" });

export const PharmacyProduct = mongoose.model<IPharmacyProduct>(
  "PharmacyProduct",
  PharmacyProductSchema,
);
export default PharmacyProduct;
