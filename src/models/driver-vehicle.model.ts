import mongoose, { Schema } from "mongoose";
import { IDriverVehicle } from "../interfaces/driver-vehicle";

const DriverVehicleSchema = new Schema<IDriverVehicle>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    vehicleTypeId: {
      type: Schema.Types.ObjectId,
      ref: "VehicleType",
      required: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      uppercase: true,
      unique: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
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
      index: true,
    },
    deletedAt: Date,
  },
  { timestamps: true }
);

// Compound indexes
DriverVehicleSchema.index({ driverId: 1, vehicleTypeId: 1 });
DriverVehicleSchema.index({ driverId: 1, isActive: 1 });
DriverVehicleSchema.index({ isOnline: 1, isActive: 1 });

export default mongoose.model<IDriverVehicle>(
  "DriverVehicle",
  DriverVehicleSchema
);
