import mongoose, { Schema } from "mongoose";
import { IUserAddress } from "../interfaces/address";

const UserAddressSchema = new Schema<IUserAddress>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: true,
    },

    houseNo: {
      type: String,
      required: true,
      trim: true,
    },

    area: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    district: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      default: "India", // ✅ FIX
    },

    pinCode: {
      type: Number,
      required: true,
    },

    addressType: {
      type: String,
      enum: ["Home", "Work", "Other"], // ✅
      required: true,
    },

    latitude: Number,
    longitude: Number,

    isSelected: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const UserAddress =
  mongoose.models.UserAddress ||
  mongoose.model("UserAddress", UserAddressSchema);

export default UserAddress;
