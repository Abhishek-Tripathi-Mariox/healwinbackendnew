import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import { Types } from "mongoose";

export const addToWallet = async (
  userId: Types.ObjectId,
  amount: number,
  referenceId?: string
) => {
  // 1️⃣ create wallet if not exists
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { returnDocument: "after", upsert: true }
  );

  // 2️⃣ store transaction
  await WalletTransaction.create({
    userId,
    amount,
    type: "CREDIT",
    referenceId,
    description: "Wallet Recharge",
  });

  return wallet;
};

export const getWallet = async (userId: Types.ObjectId) => {
  const wallet = await Wallet.findOne({ userId });

  const transactions = await WalletTransaction.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20);

  return {
    balance: wallet?.balance || 0,
    transactions,
  };
};
