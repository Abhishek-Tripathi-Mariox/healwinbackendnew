import mongoose, { Schema, Types } from "mongoose";

export interface ICtaOption {
  label: string; // e.g. "Book Ambulance", "Locate Centres"
  actionType: "booking" | "location" | "link" | "contact" | "info";
}

export interface IServiceCategory {
  _id: Types.ObjectId;
  name: string; // e.g. "Ambulance", "Emergency Health Centres"
  slug: string;
  icon: string; // lucide icon name
  description: string;
  ctaOptions: ICtaOption[]; // available CTA options for services in this category
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const CtaOptionSchema = new Schema<ICtaOption>(
  {
    label: { type: String, required: true, trim: true },
    actionType: {
      type: String,
      required: true,
      enum: ["booking", "location", "link", "contact", "info"],
      default: "info",
    },
  },
  { _id: false },
);

const ServiceCategorySchema = new Schema<IServiceCategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    icon: { type: String, default: "Heart", trim: true },
    description: { type: String, default: "", trim: true },
    ctaOptions: { type: [CtaOptionSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ServiceCategorySchema.index({ isActive: 1, sortOrder: 1 });

export const ServiceCategory = mongoose.model<IServiceCategory>(
  "ServiceCategory",
  ServiceCategorySchema,
);
