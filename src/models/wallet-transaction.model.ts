import mongoose, { Schema, Types } from "mongoose";

export type TransactionType = "CREDIT" | "DEBIT";

export interface IWalletTransaction {
  userId: Types.ObjectId;
  amount: number;
  type: TransactionType;
  referenceId?: string;
  /**
   * The gateway payment id, when this row was created by a real payment.
   * Unique — this is what makes crediting idempotent: the app's confirm call
   * and the provider's webhook both race to credit the same payment, and only
   * one row per payment can ever exist.
   */
  paymentRef?: string;
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
    paymentRef: {
      type: String,
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
// Partial, not sparse: sparse would still index rows where the field is
// explicitly null and collide on the second one.
WalletTransactionSchema.index(
  { paymentRef: 1 },
  { unique: true, partialFilterExpression: { paymentRef: { $type: "string" } } }
);

export default mongoose.model<IWalletTransaction>(
  "WalletTransaction",
  WalletTransactionSchema
);
