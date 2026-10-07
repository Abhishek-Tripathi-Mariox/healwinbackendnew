import { Types } from "mongoose";

import PaymentOrder, {
  type IPaymentOrder,
  type PaymentPurpose,
} from "../models/payment-order.model";
import AmbulanceRequest from "../models/ambulance-request.model";
import {
  PharmacyOrder,
  LabBooking,
  Consultation,
} from "../models/patient-commerce.model";
import { UserMembership } from "../models/membership.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import { emitToAdmin, emitToUser } from "../utils/socket.util";
import {
  createOrder,
  fetchPayment,
  refundPayment,
  verifyPaymentSignature,
} from "./razorpay.service";

/**
 * Checkout — one way to take money for anything.
 *
 * Every purchasable thing in the app used to settle its own money, and most
 * of them settled it by writing `paymentStatus = "PAID"` on the client's say-so.
 * This replaces all of that with a single shape:
 *
 *   quote  — WE decide the amount, from our own records, never the client's
 *   start  — a PaymentOrder row, then a gateway order carrying that row's id
 *   settle — signature + an independent fetch from the gateway, then fulfil
 *
 * The two halves of "settle" are separate on purpose. `status: "PAID"` means
 * the money is ours; `fulfilledAt` means the customer got what they paid for.
 * A crash between them leaves a row that is obviously incomplete and safe to
 * retry, instead of a ride that was paid for and never dispatched.
 *
 * Fulfilment handlers must be safe to run twice. The app's confirm call and
 * the gateway's webhook routinely arrive for the same payment within the same
 * second, and the loser of that race still has to not corrupt anything.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** What is still owed on a total, never negative. */
export const outstanding = (total: number, paid: number): number =>
  round2(Math.max(0, round2(total) - round2(paid)));

export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
  }
}

export interface Quote {
  /** Rupees still owed. Zero means nothing to collect. */
  amount: number;
  /** Shown on the Razorpay sheet and in payment history. */
  description: string;
  /** The full price, before anything already paid is taken off. */
  total: number;
  paid: number;
  notes?: Record<string, string>;
}

interface PurposeHandler {
  /** Work out what is owed, or refuse with a reason the customer can act on. */
  quote(userId: string, refId: string): Promise<Quote>;
  /** Apply the payment to the thing bought. Must be idempotent. */
  fulfil(order: IPaymentOrder): Promise<void>;
}

// ---------------------------------------------------------------- ambulance

/**
 * What a ride costs right now.
 *
 * A cancelled ride owes its cancellation fee and nothing else — the fare for
 * a trip that never happened is not a debt. Otherwise it is `grandTotal`,
 * which is the fare plus any in-transit medical expenses the control room
 * logged, and which is also exactly the figure the patient app displays. Those
 * two must not diverge: charging a number the customer was never shown is the
 * fastest way to a chargeback.
 */
export const ambulancePayable = (r: any): number => {
  if (r.status === "CANCELLED") return round2(Number(r.cancellationCharge) || 0);
  return round2(Number(r.grandTotal ?? r.amount ?? 0) || 0);
};

const findRide = async (userId: string, refId: string) => {
  const r: any = await AmbulanceRequest.findOne({ _id: refId, userId }).lean();
  if (!r) throw new CheckoutError("This booking could not be found.", 404);
  return r;
};

/** Apply money to a ride. Shared by the prepaid, post-trip and cancellation paths. */
const settleRide = async (order: IPaymentOrder) => {
  const r: any = await AmbulanceRequest.findById(order.refId);
  if (!r) return;

  // The guard against double-applying: a fulfilled order never runs again,
  // and this is checked against the order, not the ride, because a ride can
  // legitimately take several payments.
  const payable = ambulancePayable(r);
  r.amountPaid = round2((Number(r.amountPaid) || 0) + order.amount);
  r.paymentMethod = order.method === "wallet_internal" ? "WALLET" : "ONLINE";
  if (r.amountPaid >= payable - 0.5) {
    r.paymentStatus = "PAID";
    r.paidAt = r.paidAt || new Date();
  }

  const wasHeld = !!r.awaitingPayment;
  if (wasHeld) {
    r.awaitingPayment = false;
    r.statusHistory = [
      ...(r.statusHistory || []),
      {
        status: r.status,
        at: new Date(),
        by: "patient",
        note: `Payment received ₹${order.amount} — released for dispatch`,
      },
    ];
  }
  await r.save();

  emitToUser(String(r.userId), "booking:status", {
    requestId: String(r._id),
    status: r.status,
    paymentStatus: r.paymentStatus,
  });
  // A prepaid booking only becomes real work for the control room once it is
  // paid, so this — not the POST /ambulance/book — is when dispatch is told.
  if (wasHeld) {
    emitToAdmin("ambulance-request:new", {
      requestId: String(r._id),
      emergency: !!r.emergency,
      type: r.type || "Ambulance",
      patientName: r.patientName || null,
      recipientPhone: r.recipientPhone || null,
      pickup: r.pickup || null,
      createdAt: r.createdAt,
    });
  }
};

// ------------------------------------------------------------------ generic

/** The commerce models all price the same way, so they share a quote shape. */
const commerceQuote = async (
  model: any,
  userId: string,
  refId: string,
  totalField: string,
  label: string,
  notFound: string,
): Promise<Quote> => {
  const doc: any = await model.findOne({ _id: refId, userId }).lean();
  if (!doc) throw new CheckoutError(notFound, 404);
  if (doc.status === "CANCELLED") {
    throw new CheckoutError("This has been cancelled, so there is nothing to pay.");
  }
  const total = round2(Number(doc[totalField]) || 0);
  const paid = round2(Number(doc.amountPaid) || 0);
  return { amount: round2(Math.max(0, total - paid)), total, paid, description: label };
};

const commerceFulfil =
  (model: any, confirmFrom?: { from: string; to: string }) =>
  async (order: IPaymentOrder) => {
    const doc: any = await model.findById(order.refId);
    if (!doc) return;
    doc.amountPaid = round2((Number(doc.amountPaid) || 0) + order.amount);
    doc.paymentMethod = order.method === "wallet_internal" ? "WALLET" : "ONLINE";
    doc.paymentStatus = "PAID";
    doc.paidAt = doc.paidAt || new Date();
    // Payment is what turns a request into a commitment — an unpaid order
    // should never have looked confirmed in the first place.
    if (confirmFrom && doc.status === confirmFrom.from) doc.status = confirmFrom.to;
    await doc.save();
    emitToUser(String(doc.userId), "order:paid", {
      id: String(doc._id),
      purpose: order.purpose,
      amount: order.amount,
    });
  };

const PURPOSES: Record<string, PurposeHandler> = {
  ambulance_booking: {
    async quote(userId, refId) {
      const r = await findRide(userId, refId);
      if (r.status === "CANCELLED") {
        throw new CheckoutError("This booking was cancelled.");
      }
      const total = round2(Number(r.amount) || 0);
      const paid = round2(Number(r.amountPaid) || 0);
      return {
        amount: round2(Math.max(0, total - paid)),
        total,
        paid,
        description: `${r.type || "Ambulance"} booking`,
      };
    },
    fulfil: settleRide,
  },

  ambulance_ride: {
    async quote(userId, refId) {
      const r = await findRide(userId, refId);
      const total = ambulancePayable(r);
      const paid = round2(Number(r.amountPaid) || 0);
      return {
        amount: round2(Math.max(0, total - paid)),
        total,
        paid,
        description: `${r.type || "Ambulance"} trip`,
      };
    },
    fulfil: settleRide,
  },

  ambulance_cancellation: {
    async quote(userId, refId) {
      const r = await findRide(userId, refId);
      if (r.status !== "CANCELLED") {
        throw new CheckoutError("This booking has not been cancelled.");
      }
      const total = round2(Number(r.cancellationCharge) || 0);
      const paid = round2(Number(r.amountPaid) || 0);
      return {
        amount: round2(Math.max(0, total - paid)),
        total,
        paid,
        description: "Cancellation charge",
      };
    },
    fulfil: settleRide,
  },

  consultation: {
    quote: (u, r) =>
      commerceQuote(Consultation, u, r, "fee", "Doctor consultation", "Consultation not found."),
    fulfil: commerceFulfil(Consultation, { from: "REQUESTED", to: "CONFIRMED" }),
  },

  lab_booking: {
    quote: (u, r) =>
      commerceQuote(LabBooking, u, r, "totalAmount", "Lab tests", "Lab booking not found."),
    fulfil: commerceFulfil(LabBooking),
  },

  pharmacy_order: {
    quote: (u, r) =>
      commerceQuote(PharmacyOrder, u, r, "totalAmount", "Pharmacy order", "Order not found."),
    fulfil: commerceFulfil(PharmacyOrder, { from: "PLACED", to: "CONFIRMED" }),
  },

  membership: {
    async quote(userId, refId) {
      const m: any = await UserMembership.findOne({ _id: refId, userId }).lean();
      if (!m) throw new CheckoutError("Membership not found.", 404);
      const total = round2(Number(m.amountDue) || 0);
      const paid = round2(Number(m.amountPaid) || 0);
      return {
        amount: round2(Math.max(0, total - paid)),
        total,
        paid,
        description: `${m.planName || "Membership"} plan`,
      };
    },
    async fulfil(order) {
      const m: any = await UserMembership.findById(order.refId);
      if (!m) return;
      m.amountPaid = round2((Number(m.amountPaid) || 0) + order.amount);
      if (m.amountPaid >= (Number(m.amountDue) || 0) - 0.5) m.paymentStatus = "paid";
      m.paymentRef = order.gatewayPaymentId || String(order._id);
      await m.save();
      emitToUser(String(m.userId), "order:paid", {
        id: String(m._id),
        purpose: "membership",
        amount: order.amount,
      });
    },
  },
};

export const isSupportedPurpose = (p: string): p is PaymentPurpose =>
  Object.prototype.hasOwnProperty.call(PURPOSES, p);

const handlerFor = (purpose: string): PurposeHandler => {
  const h = PURPOSES[purpose];
  if (!h) {
    // wallet_topup is deliberately absent: it has its own service, with its
    // own ledger and its own well-tested idempotency. Routing it through here
    // would mean two systems crediting one wallet.
    throw new CheckoutError(`"${purpose}" cannot be paid for here.`, 400);
  }
  return h;
};

export const quoteFor = async (
  userId: string,
  purpose: string,
  refId: string,
): Promise<Quote> => handlerFor(purpose).quote(userId, refId);

// -------------------------------------------------------------------- start

export interface StartedCheckout {
  paymentOrderId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  description: string;
}

/**
 * Open a checkout.
 *
 * The PaymentOrder row is written BEFORE the gateway is called so that its id
 * can travel in the order's notes. That id is the only thing a webhook needs:
 * it arrives with no session and no client, and guessing what a payment was
 * for from its amount is not something to do with other people's money.
 */
export const startCheckout = async (params: {
  userId: string;
  purpose: string;
  refId: string;
}): Promise<StartedCheckout> => {
  const { userId, purpose, refId } = params;
  const handler = handlerFor(purpose);
  const quote = await handler.quote(userId, refId);

  if (quote.amount <= 0) {
    throw new CheckoutError("There is nothing left to pay on this.");
  }

  const row: any = await PaymentOrder.create({
    userId: new Types.ObjectId(userId),
    purpose: purpose as PaymentPurpose,
    refId: new Types.ObjectId(refId),
    description: quote.description,
    amount: quote.amount,
    currency: "INR",
    receipt: `${purpose}_${refId}_${Date.now()}`.slice(0, 40),
    status: "CREATED",
    notes: { purpose, refId, userId, ...(quote.notes || {}) },
  });

  try {
    const order = await createOrder(quote.amount, row.receipt, {
      purpose,
      refId,
      userId,
      paymentOrderId: String(row._id),
    });
    row.gatewayOrderId = order.orderId;
    await row.save();
    return {
      paymentOrderId: String(row._id),
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      description: quote.description,
    };
  } catch (err: any) {
    // A row stuck at CREATED with no gateway order is noise in every report,
    // so an order that never reached the gateway is closed out here.
    row.status = "FAILED";
    row.failureReason = err?.message || "Could not reach the payment gateway.";
    await row.save().catch(() => undefined);
    throw new CheckoutError(
      err?.message || "The payment gateway could not be reached. Please try again.",
      502,
    );
  }
};

// ------------------------------------------------------------------- settle

export interface SettleResult {
  paid: boolean;
  /** Set when the money is taken but we could not yet apply it. */
  pending?: string;
  reason?: string;
  amount?: number;
  purpose?: string;
  refId?: string;
}

/** Run the domain effect for a paid order, once. */
const fulfilOnce = async (row: any): Promise<void> => {
  if (row.fulfilledAt) return;
  await handlerFor(row.purpose).fulfil(row as IPaymentOrder);
  // Stamped after the effect, so a crash mid-way leaves the order visibly
  // unfulfilled and the retry runs it again — handlers are idempotent for
  // exactly this reason.
  await PaymentOrder.updateOne(
    { _id: row._id, fulfilledAt: { $exists: false } },
    { $set: { fulfilledAt: new Date() } },
  );
};

/**
 * Apply a captured gateway payment.
 *
 * Reached from two directions at once — the app's confirm call and the
 * provider's webhook — so the PAID transition is a single conditional update
 * and only its winner runs fulfilment. The loser still checks whether
 * fulfilment happened, because the winner may have died between the two.
 */
export const settleCapturedPayment = async (payment: {
  id: string;
  status: string;
  amount: number;
  order_id?: string;
  method?: string;
  notes?: Record<string, string>;
}): Promise<SettleResult> => {
  const notes = payment.notes || {};
  const row: any =
    (notes.paymentOrderId && Types.ObjectId.isValid(notes.paymentOrderId)
      ? await PaymentOrder.findById(notes.paymentOrderId)
      : null) ||
    (payment.order_id
      ? await PaymentOrder.findOne({ gatewayOrderId: payment.order_id })
      : null);

  if (!row) return { paid: false, reason: "not_ours" };

  if (payment.status !== "captured") {
    if (row.status === "CREATED") {
      await PaymentOrder.updateOne(
        { _id: row._id, status: "CREATED" },
        { $set: { status: "FAILED", failureReason: `Gateway reported "${payment.status}".` } },
      );
    }
    return {
      paid: false,
      reason: `Payment is "${payment.status}", not captured.`,
      purpose: row.purpose,
      refId: String(row.refId || ""),
    };
  }

  // The gateway's figure, in rupees — never the client's, and never our own
  // quote: a customer who paid less than we asked has paid less than we asked.
  const amount = round2(Math.round(payment.amount) / 100);

  const won = await PaymentOrder.findOneAndUpdate(
    { _id: row._id, status: { $in: ["CREATED", "FAILED"] } },
    {
      $set: {
        status: "PAID",
        gatewayPaymentId: payment.id,
        method: payment.method || "online",
        amount,
        paidAt: new Date(),
      },
      $unset: { failureReason: "" },
    },
    { returnDocument: "after" },
  );

  const current: any = won || (await PaymentOrder.findById(row._id));
  if (!current || current.status === "FAILED") {
    return { paid: false, reason: "Could not record this payment." };
  }

  // Already PAID by the other racer — but possibly not yet fulfilled.
  await fulfilOnce(current);

  return {
    paid: true,
    amount: current.amount,
    purpose: current.purpose,
    refId: String(current.refId || ""),
    reason: won ? undefined : "already_recorded",
  };
};

/** Mark a checkout failed at the gateway (webhook `payment.failed`). */
export const markPaymentFailed = async (payment: {
  id: string;
  order_id?: string;
  error_description?: string;
  notes?: Record<string, string>;
}): Promise<boolean> => {
  const notes = payment.notes || {};
  const query =
    notes.paymentOrderId && Types.ObjectId.isValid(notes.paymentOrderId)
      ? { _id: notes.paymentOrderId, status: "CREATED" }
      : payment.order_id
        ? { gatewayOrderId: payment.order_id, status: "CREATED" }
        : null;
  if (!query) return false;
  const res = await PaymentOrder.updateOne(query as any, {
    $set: {
      status: "FAILED",
      failureReason: payment.error_description || "The payment did not go through.",
    },
  });
  return res.modifiedCount > 0;
};

/**
 * Confirm from the app, right after the checkout sheet closes.
 *
 * The signature proves the callback came from Razorpay; the fetch proves the
 * money exists. A valid signature on an order nobody paid is still not money,
 * which is why both run.
 */
export const confirmCheckout = async (
  userId: string,
  params: { orderId: string; paymentId: string; signature: string },
): Promise<SettleResult> => {
  const row: any = await PaymentOrder.findOne({
    gatewayOrderId: params.orderId,
    userId,
  });
  if (!row) throw new CheckoutError("This payment could not be found.", 404);

  if (!(await verifyPaymentSignature(params))) {
    await PaymentOrder.updateOne(
      { _id: row._id, status: "CREATED" },
      { $set: { status: "FAILED", failureReason: "Signature mismatch." } },
    );
    throw new CheckoutError("This payment could not be verified.", 400);
  }

  const payment = await fetchPayment(params.paymentId);
  if (!payment) {
    // Money has left the customer's account by now. Telling them it failed
    // would be a lie; the webhook finishes this.
    return {
      paid: false,
      pending:
        "Your payment is being confirmed with the bank. This usually takes a few seconds.",
      purpose: row.purpose,
      refId: String(row.refId || ""),
    };
  }
  const result = await settleCapturedPayment(payment);
  if (!result.paid && !result.reason?.includes("not captured")) {
    return { ...result, pending: "Your payment is being confirmed." };
  }
  return result;
};

// -------------------------------------------------------------------- wallet

/**
 * Pay from the HealWin wallet instead of the gateway.
 *
 * The debit is a conditional update rather than read-modify-write: two
 * simultaneous payments from one wallet must not both see a sufficient
 * balance and both succeed.
 */
export const payFromWallet = async (params: {
  userId: string;
  purpose: string;
  refId: string;
}): Promise<SettleResult> => {
  const { userId, purpose, refId } = params;
  const quote = await handlerFor(purpose).quote(userId, refId);
  if (quote.amount <= 0) throw new CheckoutError("There is nothing left to pay on this.");

  // Double-tap guard. A wallet payment is instant, so two taps a second apart
  // both price the full balance (the first has not been applied yet) and both
  // debit. The gateway path cannot do this — its sheet is modal — so the
  // guard lives here rather than in the shared quote.
  const justPaid = await PaymentOrder.findOne({
    userId,
    purpose: purpose as PaymentPurpose,
    refId,
    status: "PAID",
    paidAt: { $gte: new Date(Date.now() - 60_000) },
  })
    .select("_id")
    .lean();
  if (justPaid) {
    throw new CheckoutError("This was just paid. Give it a moment and refresh.", 409);
  }

  const before = (await Wallet.findOne({ userId }).lean())?.balance ?? 0;
  const debited = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: quote.amount } },
    { $inc: { balance: -quote.amount } },
    { returnDocument: "after" },
  );
  if (!debited) {
    throw new CheckoutError(
      `Your wallet has ₹${before}. Add ₹${round2(quote.amount - before)} more, or pay by card/UPI.`,
    );
  }

  const row: any = await PaymentOrder.create({
    userId: new Types.ObjectId(userId),
    purpose: purpose as PaymentPurpose,
    refId: new Types.ObjectId(refId),
    description: quote.description,
    amount: quote.amount,
    currency: "INR",
    receipt: `wallet_${refId}_${Date.now()}`.slice(0, 40),
    method: "wallet_internal",
    status: "PAID",
    paidAt: new Date(),
    notes: { purpose, refId, userId },
  });

  await WalletTransaction.create({
    userId,
    amount: quote.amount,
    type: "DEBIT",
    referenceId: String(row._id),
    description: quote.description,
    balanceBefore: before,
    balanceAfter: debited.balance,
    status: "COMPLETED",
  });
  emitToUser(userId, "wallet:updated", {
    balance: debited.balance,
    lockedBalance: debited.lockedBalance ?? 0,
    reason: purpose,
    at: new Date().toISOString(),
  });

  try {
    await fulfilOnce(row);
  } catch (err: any) {
    // The wallet has already been debited. Refunding it here would race with
    // the retry that is about to run, so the order is left PAID-not-fulfilled
    // — which is exactly the queue that exists to be picked up again.
    console.error("[checkout] wallet fulfilment failed:", err?.message || err);
    throw new CheckoutError(
      "Your payment went through but we could not apply it yet. It will complete shortly.",
      202,
    );
  }

  return { paid: true, amount: quote.amount, purpose, refId };
};

// ------------------------------------------------------------------- refunds

/**
 * Send a real refund to the gateway and record it.
 *
 * Wallet payments are refunded back to the wallet — there is no gateway
 * payment to reverse, and crediting a card for money that came from a wallet
 * would create it out of nothing.
 */
export const refundOrder = async (params: {
  paymentOrderId: string;
  amount?: number;
  reason?: string;
  by?: Types.ObjectId | string;
}): Promise<{ refundId: string; amount: number; status: string }> => {
  const row: any = await PaymentOrder.findById(params.paymentOrderId);
  if (!row) throw new CheckoutError("Payment not found.", 404);
  if (row.status === "CREATED" || row.status === "FAILED") {
    throw new CheckoutError("This payment was never collected, so there is nothing to refund.");
  }

  const remaining = round2(row.amount - (Number(row.refundedAmount) || 0));
  const amount = round2(params.amount != null ? Number(params.amount) : remaining);
  if (!(amount > 0)) throw new CheckoutError("Enter a refund amount greater than zero.");
  if (amount > remaining + 0.001) {
    throw new CheckoutError(`At most ₹${remaining} can still be refunded on this payment.`);
  }

  let refund: { refundId: string; amount: number; status: string };
  if (row.method === "wallet_internal") {
    const updated = await Wallet.findOneAndUpdate(
      { userId: row.userId },
      { $inc: { balance: amount } },
      { returnDocument: "after", upsert: true },
    );
    const after = updated?.balance ?? amount;
    await WalletTransaction.create({
      userId: row.userId,
      amount,
      type: "CREDIT",
      referenceId: String(row._id),
      description: `Refund — ${row.description}`,
      balanceBefore: round2(after - amount),
      balanceAfter: after,
      status: "COMPLETED",
    });
    emitToUser(String(row.userId), "wallet:updated", {
      balance: after,
      reason: "refund",
      at: new Date().toISOString(),
    });
    refund = { refundId: `wallet_${row._id}_${Date.now()}`, amount, status: "processed" };
  } else {
    if (!row.gatewayPaymentId) {
      throw new CheckoutError("This payment has no gateway reference to refund against.");
    }
    refund = await refundPayment(row.gatewayPaymentId, amount, {
      notes: { purpose: row.purpose, refId: String(row.refId || "") },
      // Keyed on how much has already been refunded, so a retry of THIS
      // refund is deduped while a genuine second part-refund is not.
      idempotencyKey: `${row._id}:${row.refundedAmount || 0}`,
    });
  }

  const refundedAmount = round2((Number(row.refundedAmount) || 0) + amount);
  await PaymentOrder.updateOne(
    { _id: row._id },
    {
      $set: {
        refundedAmount,
        status: refundedAmount >= row.amount - 0.001 ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
      $push: {
        refunds: {
          refundId: refund.refundId,
          amount,
          status: refund.status,
          reason: params.reason,
          by: params.by ? new Types.ObjectId(String(params.by)) : undefined,
          at: new Date(),
        },
      },
    },
  );
  return refund;
};

/** Keep a refund's state in step with the gateway (webhook `refund.*`). */
export const syncRefundStatus = async (refund: {
  id: string;
  status: string;
  payment_id?: string;
}): Promise<boolean> => {
  const res = await PaymentOrder.updateOne(
    { "refunds.refundId": refund.id },
    { $set: { "refunds.$.status": refund.status } },
  );
  return res.modifiedCount > 0;
};

export default {
  quoteFor,
  startCheckout,
  confirmCheckout,
  settleCapturedPayment,
  markPaymentFailed,
  payFromWallet,
  refundOrder,
  syncRefundStatus,
  isSupportedPurpose,
  CheckoutError,
};
