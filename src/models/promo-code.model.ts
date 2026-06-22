import mongoose, { Schema, Types } from "mongoose";

export interface IPromoCode {
  _id: Types.ObjectId;
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  maxDiscount?: number;
  minOrderValue: number;
  maxUsage: number;
  usedCount: number;
  perUserLimit: number;
  validFrom: Date;
  validTo: Date;
  applicableVehicleTypes?: Types.ObjectId[];
  applicableServiceTypes?: ("WITHIN_CITY" | "OUTSTATION")[];
  // Which product the code is valid on. LOGISTICS = legacy goods bookings,
  // AMBULANCE = patient-app ambulance rides, ALL = both. Defaults to LOGISTICS
  // so every pre-existing code keeps its original (logistics-only) behaviour.
  serviceCategory: "LOGISTICS" | "AMBULANCE" | "ALL";
  isActive: boolean;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
}

const PromoCodeSchema = new Schema<IPromoCode>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      min: 0,
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxUsage: {
      type: Number,
      default: -1, // -1 means unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    perUserLimit: {
      type: Number,
      default: 1,
    },
    validFrom: {
      type: Date,
      required: true,
      index: true,
    },
    validTo: {
      type: Date,
      required: true,
      index: true,
    },
    applicableVehicleTypes: [
      {
        type: Schema.Types.ObjectId,
        ref: "VehicleType",
      },
    ],
    applicableServiceTypes: [
      {
        type: String,
        enum: ["WITHIN_CITY", "OUTSTATION"],
      },
    ],
    serviceCategory: {
      type: String,
      enum: ["LOGISTICS", "AMBULANCE", "ALL"],
      default: "LOGISTICS",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true },
);

// Compound indexes
PromoCodeSchema.index({ code: 1, isActive: 1, isDeleted: 1 });
PromoCodeSchema.index({ validFrom: 1, validTo: 1, isActive: 1 });

export default mongoose.model<IPromoCode>("PromoCode", PromoCodeSchema);
