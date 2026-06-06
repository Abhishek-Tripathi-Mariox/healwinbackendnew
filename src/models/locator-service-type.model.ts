import mongoose, { Schema, Types, Document } from "mongoose";

// This is for centre locator categories (Health Centres, Pharmacies, Ambulances, Labs, etc.)
export interface ILocatorServiceType extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  icon: string;
  applicableTo: "centre_locator" | "driving" | "both";
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const LocatorServiceTypeSchema = new Schema<ILocatorServiceType>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, default: "", trim: true },
    icon: { type: String, default: "Building2" },
    applicableTo: {
      type: String,
      enum: ["centre_locator", "driving", "both"],
      default: "centre_locator",
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LocatorServiceTypeSchema.index({ isActive: 1, sortOrder: 1 });
LocatorServiceTypeSchema.index({ applicableTo: 1 });

export const LocatorServiceType = mongoose.model<ILocatorServiceType>(
  "LocatorServiceType",
  LocatorServiceTypeSchema,
);
export default LocatorServiceType;
