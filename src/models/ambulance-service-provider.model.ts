import mongoose, { Schema } from "mongoose";
import { IAmbulanceServiceProvider } from "../interfaces/ambulance-service-provider";

const AmbulanceServiceProviderSchema = new Schema<IAmbulanceServiceProvider>(
  {
    name: { type: String, required: true, trim: true },
    contactPersonName: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      match: [/^[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number"],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    address: { type: String, trim: true },
    state: { type: Schema.Types.ObjectId, ref: "State", required: true },
    district: { type: Schema.Types.ObjectId, ref: "District", required: true },
    gstin: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

AmbulanceServiceProviderSchema.index({ state: 1, district: 1 });
AmbulanceServiceProviderSchema.index({ name: "text" });

export default mongoose.model<IAmbulanceServiceProvider>(
  "AmbulanceServiceProvider",
  AmbulanceServiceProviderSchema,
);
