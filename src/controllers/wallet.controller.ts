import { Request, Response, NextFunction } from "express";
import * as WalletService from "../services/wallet.service";

/**
 * ADD MONEY TO WALLET
 */
export const addToWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req as any).userId;
  const { amount, referenceId } = req.body;

  if (!amount || amount <= 0) {
    req.rCode = 0;
    req.msg = "invalid_amount";
    return next();
  }

  const wallet = await WalletService.addToWallet(userId, amount, referenceId);

  req.rData = {
    balance: wallet.balance,
  };
  req.msg = "success";
  next();
};

/**
 * GET WALLET
 */
export const getWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req as any).userId;

  const wallet = await WalletService.getWallet(userId);

  req.rData = wallet;
  req.msg = "success";
  next();
};
