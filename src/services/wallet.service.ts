import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import { Types } from "mongoose";

/**
 * `addToWallet` used to live here: it credited any amount with no payment and
 * no caller checks, and was reachable from the patient app. It is gone.
 * Crediting now happens only in wallet-topup.service — either against a
 * verified gateway payment, or through `creditManually` for staff refunds.
 */

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
