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
  stock: number;
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
