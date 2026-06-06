import RewardTransaction from "../models/reward-transaction.model";
import Wallet from "../models/wallet.model";
import { Types } from "mongoose";

export const addReferralReward = async (
  userId: Types.ObjectId,
  amount: number,
  referenceUserId: Types.ObjectId
) => {
  await RewardTransaction.create({
    userId,
    amount,
    type: "REFERRAL",
    referenceUserId,
  });

  await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { upsert: true }
  );
};

export const getRewards = async (userId: Types.ObjectId) => {
  const rewards = await RewardTransaction.find({ userId }).sort({
    createdAt: -1,
  });

  const total = rewards.reduce((sum, r) => sum + r.amount, 0);

  return { total, rewards };
};
