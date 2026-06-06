import mongoose, { Schema, Types } from "mongoose";

export interface IAddonService {
  _id: Types.ObjectId;
  name: string;
  code: string;
  description: string;
  icon: string;
  priceType: "FIXED" | "PER_FLOOR" | "PER_KG";
  price: number;
  isActive: boolean;
  applicableVehicleTypes?: Types.ObjectId[];
  sortOrder: number;
}

const AddonServiceSchema = new Schema<IAddonService>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: "",
    },
    icon: {
      type: String,
      default: "",
    },
    priceType: {
      type: String,
      enum: ["FIXED", "PER_FLOOR", "PER_KG"],
      default: "FIXED",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    applicableVehicleTypes: [
      {
        type: Schema.Types.ObjectId,
        ref: "VehicleType",
      },
    ],
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model<IAddonService>(
  "AddonService",
  AddonServiceSchema,
);
