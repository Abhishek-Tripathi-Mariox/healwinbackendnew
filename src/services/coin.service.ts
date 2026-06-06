import {
  CoinWallet,
  CoinTransaction,
  ICoinTransaction,
} from "../models/coin.model";
import { AppConfig } from "../models/app-config.model";
import { Types } from "mongoose";

/**
 * Get coin wallet for user
 */
export const getCoinWallet = async (userId: Types.ObjectId) => {
  let wallet = await CoinWallet.findOne({ userId });

  if (!wallet) {
    wallet = await CoinWallet.create({ userId, balance: 0 });
  }

  return wallet;
};

/**
 * Get coin transaction history
 */
export const getCoinTransactions = async (
  userId: Types.ObjectId,
  page = 0,
  limit = 20,
) => {
  return await CoinTransaction.find({ userId, status: "COMPLETED" })
    .sort({ createdAt: -1 })
    .skip(page * limit)
    .limit(limit);
};

/**
 * Calculate coins earned for a booking
 */
export const calculateCoinsEarned = async (
  bookingAmount: number,
  vehicleType: string,
): Promise<number> => {
  // Get coin earning config
  const config = await AppConfig.findOne({ key: "COIN_EARNING_RATE" });
  const earningRate = config?.value || 2; // Default: 2 coins per ₹100 spent

  // Truck and 2-wheeler have different rates as per UI
  let multiplier = 1;
  if (vehicleType === "2W" || vehicleType.toLowerCase().includes("truck")) {
    multiplier = 1; // Same rate for these
  }

  const coinsEarned = Math.floor(
    (bookingAmount / 100) * earningRate * multiplier,
  );
  return coinsEarned;
};

/**
 * Credit coins to user wallet
 */
export const creditCoins = async (
  userId: Types.ObjectId,
  amount: number,
  source: ICoinTransaction["source"],
  referenceId?: Types.ObjectId,
  referenceType?: "Booking" | "User",
  description?: string,
) => {
  if (amount <= 0) return;

  // Get expiry config (default 30 days)
  const expiryConfig = await AppConfig.findOne({ key: "COIN_EXPIRY_DAYS" });
  const expiryDays = expiryConfig?.value || 30;
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);

  // Create transaction
  await CoinTransaction.create({
    userId,
    amount,
    type: "EARNED",
    source,
    referenceId,
    referenceType,
    description: description || `Earned ${amount} coins`,
    expiryDate,
    status: "COMPLETED",
  });

  // Update wallet
  await CoinWallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amount, totalEarned: amount },
    },
    { upsert: true },
  );
};

/**
 * Debit coins from user wallet
 */
export const debitCoins = async (
  userId: Types.ObjectId,
  amount: number,
  source: ICoinTransaction["source"],
  referenceId?: Types.ObjectId,
  referenceType?: "Booking" | "User",
  description?: string,
) => {
  const wallet = await getCoinWallet(userId);

  if (wallet.balance < amount) {
    throw new Error("Insufficient coin balance");
  }

  // Create transaction
  await CoinTransaction.create({
    userId,
    amount: -amount,
    type: "REDEEMED",
    source,
    referenceId,
    referenceType,
    description: description || `Redeemed ${amount} coins`,
    status: "COMPLETED",
  });

  // Update wallet
  await CoinWallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: -amount, totalRedeemed: amount },
    },
  );
};

/**
 * Get coin value in rupees
 */
export const getCoinValueInRupees = async (coins: number): Promise<number> => {
  // Get conversion rate config
  const config = await AppConfig.findOne({ key: "COIN_TO_RUPEE_RATE" });
  const rate = config?.value || 1; // Default: 1 coin = ₹1

  return coins * rate;
};

/**
 * Get coin value for bank transfer (usually less)
 */
export const getCoinValueForBankTransfer = async (
  coins: number,
): Promise<number> => {
  // As per UI: 1 Coin = ₹0.9 for bank transfer
  const config = await AppConfig.findOne({ key: "COIN_TO_BANK_RATE" });
  const rate = config?.value || 0.9;

  return coins * rate;
};

/**
 * Transfer coins to wallet
 */
export const transferCoinsToWallet = async (
  userId: Types.ObjectId,
  coins: number,
) => {
  const wallet = await getCoinWallet(userId);

  if (wallet.balance < coins) {
    throw new Error("Insufficient coin balance");
  }

  const rupeeValue = await getCoinValueInRupees(coins);

  // Debit coins
  await debitCoins(
    userId,
    coins,
    "WALLET_TRANSFER",
    undefined,
    undefined,
    `Transferred ${coins} coins to HealWin Credits (₹${rupeeValue})`,
  );

  return { coins, rupeeValue };
};

/**
 * Request bank transfer for coins
 */
export const requestBankTransfer = async (
  userId: Types.ObjectId,
  coins: number,
  bankDetails: { accountNumber: string; ifsc: string; accountName: string },
) => {
  const wallet = await getCoinWallet(userId);

  if (wallet.balance < coins) {
    throw new Error("Insufficient coin balance");
  }

  const rupeeValue = await getCoinValueForBankTransfer(coins);

  // Create pending transaction
  const transaction = await CoinTransaction.create({
    userId,
    amount: -coins,
    type: "TRANSFERRED",
    source: "BANK_TRANSFER",
    description: `Bank transfer requested: ${coins} coins = ₹${rupeeValue}`,
    status: "PENDING",
  });

  // Update wallet (lock the balance)
  await CoinWallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: -coins },
    },
  );

  return { coins, rupeeValue, transactionId: transaction._id };
};

/**
 * Expire old coins (run via cron job)
 */
export const expireOldCoins = async () => {
  const now = new Date();

  // Find all expired coin transactions that haven't been marked
  const expiredTransactions = await CoinTransaction.find({
    type: "EARNED",
    status: "COMPLETED",
    expiryDate: { $lte: now },
  });

  for (const tx of expiredTransactions) {
    // Mark as expired
    tx.status = "COMPLETED"; // Already completed, we'll create new expire tx
    await tx.save();

    // Create expiry transaction
    await CoinTransaction.create({
      userId: tx.userId,
      amount: -tx.amount,
      type: "EXPIRED",
      source: "BONUS",
      description: `${tx.amount} coins expired`,
      status: "COMPLETED",
    });

    // Update wallet
    await CoinWallet.findOneAndUpdate(
      { userId: tx.userId },
      {
        $inc: { balance: -tx.amount },
      },
    );
  }

  return { expiredCount: expiredTransactions.length };
};
