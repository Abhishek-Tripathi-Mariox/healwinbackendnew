import mongoose, { Schema, Types } from "mongoose";

export type TransactionType = "CREDIT" | "DEBIT";

export interface IWalletTransaction {
  userId: Types.ObjectId;
  amount: number;
  type: TransactionType;
  referenceId?: string;
  description?: string;
  balanceBefore: number;
  balanceAfter: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
}

const WalletTransactionSchema = new Schema<IWalletTransaction>(
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
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    referenceId: {
      type: String,
      index: true,
    },
    description: String,
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "COMPLETED",
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ referenceId: 1, status: 1 });

export default mongoose.model<IWalletTransaction>(
  "WalletTransaction",
  WalletTransactionSchema
);
