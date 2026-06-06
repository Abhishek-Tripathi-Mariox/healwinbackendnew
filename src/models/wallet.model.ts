import mongoose, { Schema, Types } from "mongoose";

export interface IWallet {
  userId: Types.ObjectId;
  balance: number;
  lockedBalance: number;
}

const WalletSchema = new Schema<IWallet>(
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
    lockedBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IWallet>("Wallet", WalletSchema);
