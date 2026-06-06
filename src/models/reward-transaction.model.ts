import mongoose, { Schema, Types } from "mongoose";

export type RewardType = "REFERRAL" | "BONUS" | "CASHBACK";

const RewardTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["REFERRAL", "BONUS", "CASHBACK"],
      required: true,
      index: true,
    },
    referenceUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    referenceBookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    status: {
      type: String,
      enum: ["PENDING", "CREDITED", "EXPIRED"],
      default: "CREDITED",
      index: true,
    },
    expiryDate: Date,
  },
  { timestamps: true }
);

RewardTransactionSchema.index({ userId: 1, createdAt: -1 });
RewardTransactionSchema.index({ type: 1, status: 1 });

export default mongoose.model("RewardTransaction", RewardTransactionSchema);
