import { Request, Response, NextFunction } from "express";
import * as WalletService from "../services/wallet.service";
import { startTopUp, confirmTopUp } from "../services/wallet-topup.service";
import { isConfigured } from "../services/razorpay.service";

/**
 * POST /wallet/topup/start — begin a top-up.
 *
 * Replaces the old `/wallet/add`, which credited whatever amount the client
 * asked for with no payment at all: any signed-in patient could grant
 * themselves unlimited money. Money now only appears after a payment the
 * gateway confirms.
 */
export const startWalletTopUp = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId;
  const amount = Number(req.body?.amount);

  if (!(await isConfigured())) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "Online payments are not set up yet. Please try again later.",
      notConfigured: true,
    };
    return next();
  }
  try {
    req.rData = await startTopUp(userId, amount);
    req.msg = "success";
  } catch (e: any) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: e?.message || "Could not start the top-up." };
  }
  return next();
};

/**
 * POST /wallet/topup/confirm — credit after checkout.
 * The amount comes from the gateway, never from the client.
 */
export const confirmWalletTopUp = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId;
  const b = req.body || {};
  const orderId = String(b.orderId || b.razorpay_order_id || "");
  const paymentId = String(b.paymentId || b.razorpay_payment_id || "");
  const signature = String(b.signature || b.razorpay_signature || "");

  if (!orderId || !paymentId || !signature) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "orderId, paymentId and signature are all required." };
    return next();
  }

  const result = await confirmTopUp(userId, { orderId, paymentId, signature });
  if (!result.credited) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: result.reason, balance: result.balance };
    return next();
  }
  req.rData = result;
  req.msg = "success";
  return next();
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
