import mongoose, { Schema } from "mongoose";
import { IVehicle } from "../interfaces/vehicle";

const VehicleSchema = new Schema<IVehicle>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
      uppercase: true,
    },

    vehicleType: {
      type: String,
      enum: ["2W", "3W", "4W"],
      required: true,
    },

    vehicleBodyType: String,

    fuelType: {
      type: String,
      enum: ["Petrol", "Diesel", "CNG", "EV"],
    },

    rcFrontImage: String,
    rcBackImage: String,

    isPrimary: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IVehicle>("Vehicle", VehicleSchema);
