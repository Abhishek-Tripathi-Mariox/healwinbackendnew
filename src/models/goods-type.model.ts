import mongoose, { Schema, Types } from "mongoose";

export interface IGoodsType {
  _id: Types.ObjectId;
  name: string;
  code: string;
  category: "BUSINESS" | "PERSONAL";
  icon: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

const GoodsTypeSchema = new Schema<IGoodsType>(
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
    category: {
      type: String,
      enum: ["BUSINESS", "PERSONAL"],
      required: true,
      index: true,
    },
    icon: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
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

export default mongoose.model<IGoodsType>("GoodsType", GoodsTypeSchema);
