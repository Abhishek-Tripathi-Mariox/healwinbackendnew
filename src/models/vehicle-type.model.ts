import mongoose, { Schema } from "mongoose";
import { IVehicleType } from "../interfaces/vehicle-type";

const VehicleTypeSchema = new Schema<IVehicleType>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    // Distinguishes ambulance "Types & Pricing" entries (shown in the patient
    // ambulance booking) from legacy goods/parcel vehicle types. Defaults to
    // "ambulance" since this product is ambulance-first; legacy rows created
    // before this field simply lack it and are excluded from the ambulance list.
    category: {
      type: String,
      enum: ["ambulance", "goods"],
      default: "ambulance",
      index: true,
    },
    maxWeightKg: { type: Number, required: true },
    baseFare: { type: Number, required: true, min: 0 },
    perKmRate: { type: Number, required: true, min: 0 },
    perMinuteRate: { type: Number, required: true, min: 0 },
    minDistanceKm: { type: Number, default: 1, min: 0 },
    surgeMultiplier: { type: Number, default: 1, min: 1 },
    cancellationFee: { type: Number, default: 0, min: 0 },
    // Booking range limits
    minRangeKm: { type: Number, default: 1, min: 0 },
    maxRangeKm: { type: Number, default: 100, min: 0 },
    // Service area settings
    allowIntraCity: { type: Boolean, default: true },
    allowInterCity: { type: Boolean, default: false },
    image: { type: String },
    icon: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

VehicleTypeSchema.index({ isDeleted: 1, isActive: 1 });
VehicleTypeSchema.index({ sortOrder: 1 });

export default mongoose.model<IVehicleType>("VehicleType", VehicleTypeSchema);
