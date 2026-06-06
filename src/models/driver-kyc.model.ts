import mongoose, { Schema } from "mongoose";
import { IDriverKyc } from "../interfaces/driver-kyc";

const DriverKycSchema = new Schema<IDriverKyc>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
      unique: true,
    },

    aadhaar: {
      number: String,
      frontImage: String,
      backImage: String,
    },

    pan: {
      number: String,
      frontImage: String,
      backImage: String,
    },

    drivingLicense: {
      number: String,
      frontImage: String,
      backImage: String,
      expiryDate: String,
    },

    selfie: String,

    vehicleRc: {
      image: String,
      vehicleNumber: String,
    },

    vehicleImages: [String],
    district: String,
    bodyType: String,
    fuelType: String,

    isVerified: {
      type: Boolean,
      default: false,
    },

    verifiedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model<IDriverKyc>("DriverKyc", DriverKycSchema);
