import mongoose, { Schema, Types } from "mongoose";

export interface ICoinWallet {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
}

export interface ICoinTransaction {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  type: "EARNED" | "REDEEMED" | "EXPIRED" | "TRANSFERRED";
  source:
    | "BOOKING"
    | "REFERRAL"
    | "BONUS"
    | "REDEMPTION"
    | "BANK_TRANSFER"
    | "WALLET_TRANSFER";
  referenceId?: Types.ObjectId;
  referenceType?: "Booking" | "User";
  description: string;
  expiryDate?: Date;
  status: "PENDING" | "COMPLETED" | "FAILED";
}

// Coin Wallet Schema
const CoinWalletSchema = new Schema<ICoinWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRedeemed: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// Coin Transaction Schema
const CoinTransactionSchema = new Schema<ICoinTransaction>(
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
    },
    type: {
      type: String,
      enum: ["EARNED", "REDEEMED", "EXPIRED", "TRANSFERRED"],
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: [
        "BOOKING",
        "REFERRAL",
        "BONUS",
        "REDEMPTION",
        "BANK_TRANSFER",
        "WALLET_TRANSFER",
      ],
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      refPath: "referenceType",
    },
    referenceType: {
      type: String,
      enum: ["Booking", "User"],
    },
    description: {
      type: String,
      default: "",
    },
    expiryDate: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "COMPLETED",
    },
  },
  { timestamps: true },
);

// Compound indexes
CoinTransactionSchema.index({ userId: 1, createdAt: -1 });
CoinTransactionSchema.index({ userId: 1, type: 1, status: 1 });

export const CoinWallet = mongoose.model<ICoinWallet>(
  "CoinWallet",
  CoinWalletSchema,
);
export const CoinTransaction = mongoose.model<ICoinTransaction>(
  "CoinTransaction",
  CoinTransactionSchema,
);
