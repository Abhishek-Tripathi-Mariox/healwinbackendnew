import mongoose, { Schema, Types } from "mongoose";

export interface IServiceType {
  _id: Types.ObjectId;
  name: string;
  code: "WITHIN_CITY" | "OUTSTATION";
  description: string;
  icon: string;
  baseMultiplier: number; // Fare multiplier for this service type
  minDistanceKm: number;
  maxDistanceKm: number;
  isActive: boolean;
  sortOrder: number;
}

const ServiceTypeSchema = new Schema<IServiceType>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      enum: ["WITHIN_CITY", "OUTSTATION"],
      required: true,
      unique: true,
    },
    description: {
      type: String,
      default: "",
    },
    icon: {
      type: String,
      default: "",
    },
    baseMultiplier: {
      type: Number,
      default: 1,
      min: 0.5,
    },
    minDistanceKm: {
      type: Number,
      default: 0,
    },
    maxDistanceKm: {
      type: Number,
      default: 50, // Within city default
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model<IServiceType>("ServiceType", ServiceTypeSchema);
