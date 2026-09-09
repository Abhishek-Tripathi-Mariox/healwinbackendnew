import { Types } from "mongoose";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import { emitToUser } from "../utils/socket.util";
import {
  createOrder,
  verifyPaymentSignature,
  fetchPayment,
} from "./razorpay.service";

/**
 * Wallet top-up.
 *
 * The old `/wallet/add` credited whatever amount the client asked for, with no
 * payment of any kind — any signed-in patient could grant themselves unlimited
 * money. Crediting now requires a Razorpay payment that WE verify: the client
 * never states the amount, it comes from the gateway's own record of what was
 * captured.
 *
 * Every balance change is pushed to the user's socket, so the wallet screen
 * updates as it happens instead of only when the page is reopened.
 */

const emitBalance = (userId: Types.ObjectId | string, wallet: any, reason: string) => {
  emitToUser(String(userId), "wallet:updated", {
    balance: wallet?.balance ?? 0,
    lockedBalance: wallet?.lockedBalance ?? 0,
    reason,
    at: new Date().toISOString(),
  });
};

/** Start a top-up: create the gateway order the app opens checkout with. */
export const startTopUp = async (
  userId: Types.ObjectId | string,
  amountRupees: number,
) => {
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (amountRupees > 100000) {
    throw new Error("Top-ups above ₹1,00,000 are not allowed. Please contact support.");
  }
  const order = await createOrder(amountRupees, `wallet_${userId}_${Date.now()}`, {
    purpose: "wallet_topup",
    userId: String(userId),
  });

  // Recorded PENDING so an abandoned payment is visible rather than invisible.
  await WalletTransaction.create({
    userId,
    amount: amountRupees,
    type: "CREDIT",
    referenceId: order.orderId,
    description: "Wallet top-up (awaiting payment)",
    balanceBefore: 0,
    balanceAfter: 0,
    status: "PENDING",
  });

  return order;
};

export interface TopUpResult {
  credited: boolean;
  balance: number;
  amount?: number;
  reason?: string;
}

/**
 * Confirm a top-up after checkout.
 *
 * Three defences, in order:
 *  1. the signature must verify against our key secret;
 *  2. the gateway must independently report the payment as captured — a valid
 *     signature on an unpaid order is still not money;
 *  3. the credited amount comes from the GATEWAY, never from the client.
 *
 * Idempotent: replaying the same payment id credits nothing the second time.
 */
export const confirmTopUp = async (
  userId: Types.ObjectId | string,
  params: { orderId: string; paymentId: string; signature: string },
): Promise<TopUpResult> => {
  const wallet = await Wallet.findOne({ userId }).lean();
  const currentBalance = wallet?.balance ?? 0;

  if (!(await verifyPaymentSignature(params))) {
    await WalletTransaction.updateOne(
      { userId, referenceId: params.orderId, status: "PENDING" },
      { $set: { status: "FAILED", description: "Top-up failed — signature mismatch" } },
    );
    return { credited: false, balance: currentBalance, reason: "Payment could not be verified." };
  }

  const payment = await fetchPayment(params.paymentId);
  if (!payment) {
    return {
      credited: false,
      balance: currentBalance,
      reason: "Could not confirm the payment with the gateway. It will be credited once confirmed.",
    };
  }
  return creditCapturedPayment(userId, payment);
};

/**
 * Work out whose wallet a gateway payment belongs to.
 *
 * Preferred source is the notes we attached when the order was created, which
 * Razorpay copies onto the payment. That is not something to bet a credit on,
 * though — notes can be dropped or the payment can reach us by a route that
 * does not carry them — so the pending row written by `startTopUp` is the
 * fallback: it was keyed by order id before the customer ever paid.
 *
 * Returns null when the payment is not one of ours to credit.
 */
export const resolveTopUpUser = async (payment: {
  order_id?: string;
  notes?: Record<string, string>;
}): Promise<string | null> => {
  const notes = payment.notes || {};
  if (notes.purpose === "wallet_topup" && notes.userId) return String(notes.userId);

  if (!payment.order_id) return null;
  const pending = await WalletTransaction.findOne({
    referenceId: payment.order_id,
    type: "CREDIT",
  })
    .select("userId")
    .lean();
  return pending ? String(pending.userId) : null;
};

/**
 * Credit a captured gateway payment. The single place a top-up ever adds money.
 *
 * Both the app's confirm call and Razorpay's webhook arrive for the same
 * payment, often at the same moment, so this has to be safe to run twice at
 * once. Two steps make it so:
 *
 *  1. Ensure exactly one ledger row carries this payment id. `paymentRef` is
 *     uniquely indexed, so a concurrent racer's insert fails rather than
 *     producing a second row.
 *  2. Move that one row PENDING -> COMPLETED with a single atomic update. Only
 *     the caller whose update matched a PENDING row touches the balance.
 *
 * The transition happens BEFORE the balance changes on purpose. A crash in
 * between loses a credit — visible as a COMPLETED row and fixable by hand —
 * whereas the other order would mint money on the retry.
 */
export const creditCapturedPayment = async (
  userId: Types.ObjectId | string,
  payment: { id: string; status: string; amount: number; order_id?: string },
): Promise<TopUpResult> => {
  const balanceNow = async () => (await Wallet.findOne({ userId }).lean())?.balance ?? 0;

  if (payment.status !== "captured") {
    return {
      credited: false,
      balance: await balanceNow(),
      reason: `Payment is "${payment.status}", not captured. Nothing has been credited.`,
    };
  }

  // The gateway's figure, in rupees — never the client's.
  const amount = Math.round(payment.amount) / 100;
  const orderId = payment.order_id || "";

  // Step 1 — one row, one payment.
  const tagged = await WalletTransaction.findOneAndUpdate(
    { userId, referenceId: orderId, status: "PENDING", paymentRef: { $exists: false } },
    { $set: { paymentRef: payment.id, amount } },
    { returnDocument: "after" },
  );
  if (!tagged) {
    try {
      await WalletTransaction.create({
        userId,
        amount,
        type: "CREDIT",
        referenceId: orderId || payment.id,
        paymentRef: payment.id,
        description: "Wallet top-up",
        balanceBefore: 0,
        balanceAfter: 0,
        status: "PENDING",
      });
    } catch (e: any) {
      // 11000 = the unique paymentRef index rejected it, so a row already
      // exists. Fall through: step 2 decides whether it still needs crediting.
      if (e?.code !== 11000) throw e;
    }
  }

  // Step 2 — exactly one caller wins this transition.
  const won = await WalletTransaction.findOneAndUpdate(
    { paymentRef: payment.id, status: "PENDING" },
    { $set: { status: "COMPLETED", type: "CREDIT", amount, description: "Wallet top-up" } },
    { returnDocument: "after" },
  );
  if (!won) {
    return {
      credited: false,
      balance: await balanceNow(),
      reason: "This payment was already credited.",
    };
  }

  const updated = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { returnDocument: "after", upsert: true },
  );
  const after = updated?.balance ?? amount;
  await WalletTransaction.updateOne(
    { _id: won._id },
    { $set: { balanceBefore: after - amount, balanceAfter: after } },
  );

  emitBalance(userId, updated, "topup");
  return { credited: true, balance: after, amount };
};

/**
 * Credit a wallet without a customer payment — a refund, a goodwill credit, a
 * correction. Staff-initiated only; there is deliberately no patient-facing
 * route to this.
 */
export const creditManually = async (
  userId: Types.ObjectId | string,
  amount: number,
  description: string,
  referenceId?: string,
) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  const before = (await Wallet.findOne({ userId }).lean())?.balance ?? 0;
  const updated = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { returnDocument: "after", upsert: true },
  );
  await WalletTransaction.create({
    userId,
    amount,
    type: "CREDIT",
    referenceId,
    description,
    balanceBefore: before,
    balanceAfter: updated?.balance ?? before + amount,
    status: "COMPLETED",
  });
  emitBalance(userId, updated, "manual_credit");
  return updated;
};

export default {
  startTopUp,
  confirmTopUp,
  creditCapturedPayment,
  resolveTopUpUser,
  creditManually,
};
