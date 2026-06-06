import { Types } from "mongoose";
import crypto from "crypto";
import Booking from "../models/booking.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import User from "../models/Users";
import config from "../config";

// Razorpay configuration (replace with actual credentials)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_xxxxx";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "test_secret";

// Mock Razorpay instance - Replace with actual razorpay in production
let razorpayInstance: any = null;

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
 * Initialize Razorpay SDK
 */
export const initializeRazorpay = async () => {
  try {
    // In production, use:
    // const Razorpay = require('razorpay');
    // razorpayInstance = new Razorpay({
    //   key_id: RAZORPAY_KEY_ID,
    //   key_secret: RAZORPAY_KEY_SECRET,
    // });

    console.log("Razorpay SDK initialized (mock mode)");
    return true;
  } catch (error) {
    console.error("Failed to initialize Razorpay:", error);
    return false;
  }
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
    const amountInPaise = Math.round(amount * 100); // Convert to paise

    if (razorpayInstance) {
      const order = await razorpayInstance.orders.create({
        amount: amountInPaise,
        currency,
        receipt,
        notes: notes || {},
      });
      return order;
    } else {
      // Mock order for development
      const mockOrder: RazorpayOrder = {
        id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        entity: "order",
        amount: amountInPaise,
        amount_paid: 0,
        amount_due: amountInPaise,
        currency,
        receipt,
        status: "created",
        attempts: 0,
        created_at: Date.now(),
      };
      console.log("Created mock order:", mockOrder);
      return mockOrder;
    }
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
): boolean => {
  try {
    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    return expectedSignature === signature;
  } catch (error) {
    console.error("Failed to verify payment signature:", error);
    return false;
  }
};

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
    // In mock mode, accept all payments
    const isValid = razorpayInstance
      ? verifyPaymentSignature(orderId, paymentId, signature)
      : true;

    if (!isValid) {
      return {
        success: false,
        message: "Invalid payment signature",
      };
    }

    // Update booking payment status
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

    if (razorpayInstance && booking.paymentTransactionId) {
      const refund = await razorpayInstance.payments.refund(
        booking.paymentTransactionId,
        {
          amount: Math.round(refundAmount * 100), // Convert to paise
          notes: {
            bookingId: bookingId.toString(),
            reason: reason || "Booking cancelled",
          },
        },
      );

      booking.refundAmount = refundAmount;
      booking.refundStatus = "PROCESSED";
      await booking.save();

      return {
        success: true,
        refundId: refund.id,
        amount: refundAmount,
        message: "Refund processed successfully",
      };
    } else {
      // Mock refund
      booking.refundAmount = refundAmount;
      booking.refundStatus = "PROCESSED";
      await booking.save();

      return {
        success: true,
        refundId: `refund_${Date.now()}`,
        amount: refundAmount,
        message: "Refund processed successfully (mock)",
      };
    }
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
    const order = await createOrder(
      amount,
      "INR",
      `wallet_${userId}_${Date.now()}`,
      {
        userId: userId.toString(),
        type: "wallet_recharge",
      },
    );

    return order;
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
  amount: number,
): Promise<PaymentVerificationResult> => {
  try {
    const isValid = razorpayInstance
      ? verifyPaymentSignature(orderId, paymentId, signature)
      : true;

    if (!isValid) {
      return {
        success: false,
        message: "Invalid payment signature",
      };
    }

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: 0,
      });
    }

    // Add amount to wallet
    wallet.balance += amount;
    await wallet.save();

    // Create transaction record
    await WalletTransaction.create({
      userId,
      type: "CREDIT",
      amount,
      balanceBefore: wallet.balance - amount,
      balanceAfter: wallet.balance,
      description: "Wallet recharge",
      referenceId: paymentId,
      status: "COMPLETED",
    });

    return {
      success: true,
      message: "Wallet recharged successfully",
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

    if (!wallet || wallet.balance < booking.finalFare) {
      return { success: false, message: "Insufficient wallet balance" };
    }

    // Deduct from wallet
    wallet.balance -= booking.finalFare;
    await wallet.save();

    // Create transaction
    await WalletTransaction.create({
      userId,
      type: "DEBIT",
      amount: booking.finalFare,
      balanceBefore: wallet.balance + booking.finalFare,
      balanceAfter: wallet.balance,
      description: `Payment for booking ${booking.bookingNumber || "N/A"}`,
      referenceId: bookingId.toString(),
      status: "COMPLETED",
    });

    // Update booking
    booking.paymentStatus = "PAID";
    booking.paymentMethod = "WALLET";
    await booking.save();

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
): Promise<{ success: boolean; message: string }> => {
  try {
    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");

    if (signature !== expectedSignature) {
      return { success: false, message: "Invalid webhook signature" };
    }

    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    switch (event) {
      case "payment.captured":
        console.log("Payment captured:", paymentEntity?.id);
        break;

      case "payment.failed":
        console.log("Payment failed:", paymentEntity?.id);
        // Update booking status if needed
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
