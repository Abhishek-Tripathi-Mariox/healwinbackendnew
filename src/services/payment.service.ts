import { Types } from "mongoose";
import Booking from "../models/booking.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import * as Gateway from "./razorpay.service";
import { emitToUser } from "../utils/socket.util";
import {
  startTopUp,
  confirmTopUp,
  creditCapturedPayment,
  resolveTopUpUser,
} from "./wallet-topup.service";

/**
 * Payments.
 *
 * This module used to run entirely on a mock: `razorpayInstance` was never
 * assigned, so every verification fell into an "accept it, we're in dev" branch
 * and any caller could mark a booking PAID, or credit a wallet with an amount
 * of their own choosing, by posting three made-up strings. Every path here now
 * goes through razorpay.service, which uses the credentials configured in the
 * admin panel and verifies signatures for real.
 */

interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  created_at: number;
}

interface PaymentVerificationResult {
  success: boolean;
  message: string;
  paymentId?: string;
  orderId?: string;
}

interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  message: string;
}

/**
 * Report whether payments can actually be taken, at boot. Credentials live in
 * the database, so this is a status check rather than an initialisation step —
 * keys added in the admin panel later are picked up without a restart.
 */
export const initializeRazorpay = async () => {
  const creds = await Gateway.getCredentials();
  if (creds.source === "none") {
    console.warn(
      "[payments] No gateway credentials — payments will be refused until keys are added under System → Payment Configuration.",
    );
    return false;
  }
  console.log(`[payments] Razorpay ready (${creds.mode} mode, from ${creds.source})`);
  return true;
};

/**
 * Create Razorpay order for payment
 */
export const createOrder = async (
  amount: number,
  currency: string = "INR",
  receipt: string,
  notes?: Record<string, string>,
): Promise<RazorpayOrder | null> => {
  try {
    const order = await Gateway.createOrder(amount, receipt, notes || {});
    return {
      id: order.orderId,
      entity: "order",
      amount: order.amount,
      amount_paid: 0,
      amount_due: order.amount,
      currency: order.currency || currency,
      receipt,
      status: "created",
      attempts: 0,
      created_at: Date.now(),
    };
  } catch (error) {
    console.error("Failed to create Razorpay order:", error);
    return null;
  }
};

/**
 * Verify Razorpay payment signature
 */
export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<boolean> => Gateway.verifyPaymentSignature({ orderId, paymentId, signature });

/**
 * Create order for booking payment
 */
export const createBookingPaymentOrder = async (
  bookingId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<{ order: RazorpayOrder; booking: any } | null> => {
  try {
    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.paymentStatus === "PAID") {
      throw new Error("Payment already completed");
    }

    const order = await createOrder(
      booking.finalFare,
      "INR",
      `booking_${booking.bookingNumber || bookingId.toString()}`,
      {
        bookingId: bookingId.toString(),
        userId: userId.toString(),
        bookingNumber: booking.bookingNumber || "",
      },
    );

    if (!order) {
      throw new Error("Failed to create payment order");
    }

    // Store order ID in booking
    booking.paymentTransactionId = order.id;
    await booking.save();

    return { order, booking };
  } catch (error) {
    console.error("Failed to create booking payment order:", error);
    return null;
  }
};

/**
 * Verify and complete booking payment
 */
export const verifyBookingPayment = async (
  bookingId: Types.ObjectId,
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<PaymentVerificationResult> => {
  try {
    if (!(await verifyPaymentSignature(orderId, paymentId, signature))) {
      return { success: false, message: "Invalid payment signature" };
    }

    // A signature only proves the callback came from Razorpay for this order —
    // not that anyone paid. Ask the gateway what actually happened.
    const payment = await Gateway.fetchPayment(paymentId);
    if (!payment) {
      return {
        success: false,
        message: "Could not confirm this payment with the gateway.",
      };
    }
    if (payment.status !== "captured") {
      return {
        success: false,
        message: `Payment is "${payment.status}", not captured.`,
      };
    }
    if (payment.order_id && payment.order_id !== orderId) {
      return { success: false, message: "This payment belongs to another order." };
    }

    const target = await Booking.findById(bookingId);
    if (!target) {
      return { success: false, message: "Booking not found" };
    }
    if (target.paymentStatus === "PAID") {
      // Idempotent: a retried callback confirms, it does not re-charge.
      return { success: true, message: "Payment already recorded", paymentId, orderId };
    }
    // Underpayment must not mark the booking settled.
    const paidRupees = payment.amount / 100;
    if (paidRupees + 0.01 < target.finalFare) {
      return {
        success: false,
        message: `Only ₹${paidRupees} was paid against a fare of ₹${target.finalFare}.`,
      };
    }

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        paymentStatus: "PAID",
        paymentTransactionId: paymentId,
        paidAt: new Date(),
      },
      { returnDocument: "after" },
    );

    if (!booking) {
      return {
        success: false,
        message: "Booking not found",
      };
    }

    return {
      success: true,
      message: "Payment verified successfully",
      paymentId,
      orderId,
    };
  } catch (error: any) {
    console.error("Failed to verify booking payment:", error);
    return {
      success: false,
      message: error.message || "Payment verification failed",
    };
  }
};

/**
 * Process refund for booking
 */
export const processRefund = async (
  bookingId: Types.ObjectId,
  amount?: number,
  reason?: string,
): Promise<RefundResult> => {
  try {
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return { success: false, message: "Booking not found" };
    }

    if (booking.paymentStatus !== "PAID") {
      return { success: false, message: "No payment to refund" };
    }

    const refundAmount = amount || booking.finalFare;

    const client = await Gateway.getClient();
    if (!client || !booking.paymentTransactionId) {
      // Refusing beats the old behaviour of marking a refund PROCESSED when no
      // money had moved — that told staff and customer a lie they would only
      // discover at the bank.
      return {
        success: false,
        message: !booking.paymentTransactionId
          ? "This booking has no gateway payment to refund."
          : "Payments are not configured, so no refund can be issued.",
      };
    }

    const refund = await client.payments.refund(booking.paymentTransactionId, {
      amount: Math.round(refundAmount * 100), // paise
      notes: {
        bookingId: bookingId.toString(),
        reason: reason || "Booking cancelled",
      },
    });

    booking.refundAmount = refundAmount;
    booking.refundStatus = "PROCESSED";
    await booking.save();

    return {
      success: true,
      refundId: refund.id,
      amount: refundAmount,
      message: "Refund processed successfully",
    };
  } catch (error: any) {
    console.error("Failed to process refund:", error);
    return {
      success: false,
      message: error.message || "Refund processing failed",
    };
  }
};

/**
 * Add money to wallet
 */
export const createWalletRechargeOrder = async (
  userId: Types.ObjectId,
  amount: number,
): Promise<RazorpayOrder | null> => {
  try {
    // Same path as /wallet/topup/start, so a recharge started here is
    // recognised by the webhook and credited exactly once either way.
    const order = await startTopUp(userId, amount);
    return {
      id: order.orderId,
      entity: "order",
      amount: order.amount,
      amount_paid: 0,
      amount_due: order.amount,
      currency: order.currency,
      receipt: `wallet_${userId}`,
      status: "created",
      attempts: 0,
      created_at: Date.now(),
    };
  } catch (error) {
    console.error("Failed to create wallet recharge order:", error);
    return null;
  }
};

/**
 * Verify and complete wallet recharge
 */
export const verifyWalletRecharge = async (
  userId: Types.ObjectId,
  orderId: string,
  paymentId: string,
  signature: string,
  /**
   * Accepted for backwards compatibility with existing callers and IGNORED.
   * This parameter is exactly how the old version could be exploited: it
   * credited whatever number the client sent. The amount now comes from the
   * gateway's record of the payment.
   */
  _amount?: number,
): Promise<PaymentVerificationResult> => {
  try {
    const result = await confirmTopUp(userId, { orderId, paymentId, signature });
    if (!result.credited) {
      return { success: false, message: result.reason || "Wallet recharge failed" };
    }
    return {
      success: true,
      message: `₹${result.amount} added to your wallet.`,
      paymentId,
      orderId,
    };
  } catch (error: any) {
    console.error("Failed to verify wallet recharge:", error);
    return {
      success: false,
      message: error.message || "Wallet recharge failed",
    };
  }
};

/**
 * Pay using wallet balance
 */
export const payUsingWallet = async (
  userId: Types.ObjectId,
  bookingId: Types.ObjectId,
): Promise<{ success: boolean; message: string }> => {
  try {
    const [wallet, booking] = await Promise.all([
      Wallet.findOne({ userId }),
      Booking.findOne({ _id: bookingId, userId }),
    ]);

    if (!booking) {
      return { success: false, message: "Booking not found" };
    }

    if (booking.paymentStatus === "PAID") {
      return { success: false, message: "Already paid" };
    }

    const fare = booking.finalFare;
    if (!wallet || wallet.balance < fare) {
      return { success: false, message: "Insufficient wallet balance" };
    }

    // Debit in one conditional update. Read-then-write let two taps on the pay
    // button both see the same balance and each deduct it, taking the wallet
    // negative; requiring the balance to still cover the fare in the same
    // operation means the second one simply finds nothing to match.
    const debited = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: fare } },
      { $inc: { balance: -fare } },
      { returnDocument: "after" },
    );
    if (!debited) {
      return { success: false, message: "Insufficient wallet balance" };
    }

    await WalletTransaction.create({
      userId,
      type: "DEBIT",
      amount: fare,
      balanceBefore: debited.balance + fare,
      balanceAfter: debited.balance,
      description: `Payment for booking ${booking.bookingNumber || "N/A"}`,
      referenceId: bookingId.toString(),
      status: "COMPLETED",
    });

    // Update booking
    booking.paymentStatus = "PAID";
    booking.paymentMethod = "WALLET";
    await booking.save();

    emitToUser(String(userId), "wallet:updated", {
      balance: debited.balance,
      lockedBalance: debited.lockedBalance ?? 0,
      reason: "booking_payment",
      at: new Date().toISOString(),
    });

    return { success: true, message: "Payment successful" };
  } catch (error: any) {
    console.error("Failed to pay using wallet:", error);
    return { success: false, message: error.message || "Payment failed" };
  }
};

/**
 * Get payment methods for user
 */
export const getPaymentMethods = async (userId: Types.ObjectId) => {
  const wallet = await Wallet.findOne({ userId });

  return {
    wallet: {
      available: true,
      balance: wallet?.balance || 0,
    },
    upi: {
      available: true,
      providers: ["GOOGLE_PAY", "PHONEPE", "PAYTM"],
    },
    cards: {
      available: true,
    },
    netBanking: {
      available: true,
    },
    cash: {
      available: true,
    },
  };
};

/**
 * Handle Razorpay webhook
 */
export const handleWebhook = async (
  payload: any,
  signature: string,
  /**
   * The exact bytes Razorpay sent. The signature covers those, so
   * re-serialising `payload` produces a different string and never matches —
   * which is why the previous JSON.stringify version rejected every real
   * delivery. Provided by the raw-body capture in server.ts.
   */
  rawBody?: string,
): Promise<{ success: boolean; message: string }> => {
  try {
    const body = rawBody ?? JSON.stringify(payload);
    if (!(await Gateway.verifyWebhookSignature(body, signature))) {
      return { success: false, message: "Invalid webhook signature" };
    }

    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    switch (event) {
      case "payment.captured": {
        const userId = paymentEntity && (await resolveTopUpUser(paymentEntity));
        if (userId) {
          const res = await creditCapturedPayment(userId, paymentEntity);
          console.log(
            `[payments] webhook ${paymentEntity.id}: ${res.credited ? `credited ₹${res.amount}` : res.reason}`,
          );
        }
        break;
      }

      case "payment.failed":
        await WalletTransaction.updateOne(
          { referenceId: paymentEntity?.order_id, status: "PENDING" },
          { $set: { status: "FAILED", description: "Payment failed at the gateway" } },
        );
        break;

      case "refund.processed":
        console.log("Refund processed:", payload.payload?.refund?.entity?.id);
        break;

      default:
        console.log("Unhandled webhook event:", event);
    }

    return { success: true, message: "Webhook processed" };
  } catch (error: any) {
    console.error("Failed to handle webhook:", error);
    return { success: false, message: error.message };
  }
};

/**
 * Get transaction history
 */
export const getTransactionHistory = async (
  userId: Types.ObjectId,
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    WalletTransaction.countDocuments({ userId }),
  ]);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};
