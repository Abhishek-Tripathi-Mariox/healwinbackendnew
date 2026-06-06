import { Request, Response } from "express";
import * as CoinService from "../services/coin.service";
import { CoinTransaction } from "../models/coin.model";

/**
 * Get coin wallet balance
 */
export const getCoinBalance = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const wallet = await CoinService.getCoinWallet(userId);

    res.json({
      success: true,
      data: {
        balance: wallet?.balance || 0,
        totalEarned: wallet?.totalEarned || 0,
        totalRedeemed: wallet?.totalRedeemed || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch coin balance",
    });
  }
};

/**
 * Get coin transaction history
 */
export const getCoinTransactions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { type, page = 1, limit = 20 } = req.query;

    const query: any = { userId };
    if (type) {
      query.type = type;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      CoinTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("bookingId", "bookingNumber"),
      CoinTransaction.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch transactions",
    });
  }
};

/**
 * Transfer coins to wallet
 */
export const transferToWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { coins } = req.body;

    if (!coins || coins < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum 100 coins required for transfer",
      });
    }

    const wallet = await CoinService.getCoinWallet(userId);
    if (!wallet || wallet.balance < coins) {
      return res.status(400).json({
        success: false,
        message: "Insufficient coin balance",
      });
    }

    const result = await CoinService.transferCoinsToWallet(userId, coins);

    res.json({
      success: true,
      message: "Coins transferred to wallet successfully",
      data: {
        coinsTransferred: result.coins,
        amountCredited: result.rupeeValue,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to transfer coins",
    });
  }
};

/**
 * Request bank transfer
 */
export const requestBankTransfer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { coins, bankDetails } = req.body;

    if (!coins || coins < 500) {
      return res.status(400).json({
        success: false,
        message: "Minimum 500 coins required for bank transfer",
      });
    }

    if (!bankDetails || !bankDetails.accountNumber || !bankDetails.ifscCode) {
      return res.status(400).json({
        success: false,
        message: "Bank details are required",
      });
    }

    const wallet = await CoinService.getCoinWallet(userId);
    if (!wallet || wallet.balance < coins) {
      return res.status(400).json({
        success: false,
        message: "Insufficient coin balance",
      });
    }

    const result = await CoinService.requestBankTransfer(
      userId,
      coins,
      bankDetails,
    );

    res.json({
      success: true,
      message: "Bank transfer request submitted successfully",
      data: {
        requestId: result.transactionId,
        coinsRequested: result.coins,
        estimatedAmount: result.rupeeValue,
        status: "PENDING",
        estimatedProcessingDays: 5,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to request bank transfer",
    });
  }
};

/**
 * Get rewards history (earned coins)
 */
export const getRewardsHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      CoinTransaction.find({
        userId,
        type: "EARNED",
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("bookingId", "bookingNumber"),
      CoinTransaction.countDocuments({ userId, type: "EARNED" }),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch rewards history",
    });
  }
};

/**
 * Get redemption history (used coins)
 */
export const getRedemptionHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      CoinTransaction.find({
        userId,
        type: { $in: ["REDEEMED", "TRANSFERRED", "BANK_TRANSFER"] },
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("bookingId", "bookingNumber"),
      CoinTransaction.countDocuments({
        userId,
        type: { $in: ["REDEEMED", "TRANSFERRED", "BANK_TRANSFER"] },
      }),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch redemption history",
    });
  }
};
