import mongoose, { Schema } from "mongoose";
import { IVehicleCategory } from "../interfaces/vehicle-category";

const VehicleCategorySchema = new Schema<IVehicleCategory>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    icon: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IVehicleCategory>(
  "VehicleCategory",
  VehicleCategorySchema
);
