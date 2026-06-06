import { Request, Response } from "express";
import { Types } from "mongoose";
import * as PaymentService from "../services/payment.service";

/**
 * Get payment methods
 */
export const getPaymentMethods = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const methods = await PaymentService.getPaymentMethods(userId);

    res.json({
      success: true,
      data: methods,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch payment methods",
    });
  }
};

/**
 * Create payment order for booking
 */
export const createBookingPaymentOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { bookingId } = req.params;

    const result = await PaymentService.createBookingPaymentOrder(
      new Types.ObjectId(bookingId),
      userId
    );

    if (!result) {
      return res.status(400).json({
        success: false,
        message: "Failed to create payment order",
      });
    }

    res.json({
      success: true,
      data: {
        orderId: result.order.id,
        amount: result.order.amount / 100, // Convert from paise
        currency: result.order.currency,
        bookingNumber: result.booking.bookingNumber,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create payment order",
    });
  }
};

/**
 * Verify booking payment
 */
export const verifyBookingPayment = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification details",
      });
    }

    const result = await PaymentService.verifyBookingPayment(
      new Types.ObjectId(bookingId),
      orderId,
      paymentId,
      signature
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        paymentId: result.paymentId,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Payment verification failed",
    });
  }
};

/**
 * Pay using wallet
 */
export const payUsingWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { bookingId } = req.params;

    const result = await PaymentService.payUsingWallet(
      userId,
      new Types.ObjectId(bookingId)
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Payment failed",
    });
  }
};

/**
 * Create wallet recharge order
 */
export const createWalletRechargeOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { amount } = req.body;

    if (!amount || amount < 10) {
      return res.status(400).json({
        success: false,
        message: "Minimum recharge amount is ₹10",
      });
    }

    const order = await PaymentService.createWalletRechargeOrder(userId, amount);

    if (!order) {
      return res.status(400).json({
        success: false,
        message: "Failed to create recharge order",
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount / 100,
        currency: order.currency,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create recharge order",
    });
  }
};

/**
 * Verify wallet recharge
 */
export const verifyWalletRecharge = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { orderId, paymentId, signature, amount } = req.body;

    if (!orderId || !paymentId || !signature || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing verification details",
      });
    }

    const result = await PaymentService.verifyWalletRecharge(
      userId,
      orderId,
      paymentId,
      signature,
      amount
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Wallet recharge verification failed",
    });
  }
};

/**
 * Get transaction history
 */
export const getTransactionHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { page = 1, limit = 20 } = req.query;

    const result = await PaymentService.getTransactionHistory(
      userId,
      Number(page),
      Number(limit)
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch transaction history",
    });
  }
};

/**
 * Handle Razorpay webhook
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    const result = await PaymentService.handleWebhook(req.body, signature);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Webhook processing failed",
    });
  }
};

/**
 * Request refund (admin)
 */
export const requestRefund = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { amount, reason } = req.body;

    const result = await PaymentService.processRefund(
      new Types.ObjectId(bookingId),
      amount,
      reason
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        refundId: result.refundId,
        amount: result.amount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Refund processing failed",
    });
  }
};
