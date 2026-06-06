import mongoose, { Schema, Types } from "mongoose";

export interface ICancellationReason {
  _id: Types.ObjectId;
  reason: string;
  code: string;
  applicableTo: "USER" | "DRIVER" | "BOTH";
  penaltyType: "NONE" | "FIXED" | "PERCENTAGE";
  penaltyValue: number;
  isRefundable: boolean;
  refundPercentage: number;
  isActive: boolean;
  sortOrder: number;
}

const CancellationReasonSchema = new Schema<ICancellationReason>(
  {
    reason: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    applicableTo: {
      type: String,
      enum: ["USER", "DRIVER", "BOTH"],
      default: "BOTH",
      index: true,
    },
    penaltyType: {
      type: String,
      enum: ["NONE", "FIXED", "PERCENTAGE"],
      default: "NONE",
    },
    penaltyValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    isRefundable: {
      type: Boolean,
      default: true,
    },
    refundPercentage: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
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

export default mongoose.model<ICancellationReason>(
  "CancellationReason",
  CancellationReasonSchema,
);
