import mongoose, { Schema, Types } from "mongoose";

/**
 * One row per attempt to take money for something.
 *
 * Before this existed every domain invented its own payment columns, so there
 * was no single place that said "₹X was taken from this person, for this
 * thing, and here is the gateway's id for it". A ride could be marked PAID
 * with no payment behind it, and a refund had nowhere to record the refund id.
 *
 * The row is created BEFORE the customer is sent to the gateway, and its id
 * travels in the order's `notes`. That is what lets a webhook arriving out of
 * nowhere — no session, no client — say with certainty what the money was for.
 *
 * `fulfilledAt` is deliberately separate from `status: "PAID"`. Taking the
 * money and doing the thing it paid for are two steps, and the gap between
 * them is where a crash loses a booking. A PAID row with no `fulfilledAt` is a
 * retryable job, not a mystery.
 */

export type PaymentPurpose =
  | "wallet_topup"
  /** Prepaid, before a non-emergency ambulance is dispatched. */
  | "ambulance_booking"
  /** The bill after the trip (SOS, or a balance on a prepaid ride). */
  | "ambulance_ride"
  | "ambulance_cancellation"
  | "consultation"
  | "lab_booking"
  | "pharmacy_order"
  | "membership";

export const PAYMENT_PURPOSES: PaymentPurpose[] = [
  "wallet_topup",
  "ambulance_booking",
  "ambulance_ride",
  "ambulance_cancellation",
  "consultation",
  "lab_booking",
  "pharmacy_order",
  "membership",
];

export type PaymentOrderStatus =
  | "CREATED"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface IPaymentRefund {
  refundId: string;
  amount: number;
  status: string;
  reason?: string;
  by?: Types.ObjectId;
  at: Date;
}

export interface IPaymentOrder {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  purpose: PaymentPurpose;
  /** The document being paid for (ride, order, booking…). Absent for top-ups. */
  refId?: Types.ObjectId;
  /** What the customer sees on the sheet and in their payment history. */
  description: string;
  /** Rupees. Set from OUR quote at start, and re-set from the gateway on capture. */
  amount: number;
  currency: string;
  receipt: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  /** upi / card / netbanking / wallet(razorpay) / wallet_internal / cash. */
  method?: string;
  status: PaymentOrderStatus;
  paidAt?: Date;
  fulfilledAt?: Date;
  failureReason?: string;
  refundedAmount: number;
  refunds: IPaymentRefund[];
  notes?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<IPaymentRefund>(
  {
    refundId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, required: true },
    reason: String,
    by: { type: Schema.Types.ObjectId, ref: "Admin" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const PaymentOrderSchema = new Schema<IPaymentOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true, index: true },
    refId: { type: Schema.Types.ObjectId },
    description: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    receipt: { type: String, default: "" },
    gatewayOrderId: { type: String },
    gatewayPaymentId: { type: String },
    method: { type: String },
    status: {
      type: String,
      enum: ["CREATED", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      default: "CREATED",
      index: true,
    },
    paidAt: Date,
    fulfilledAt: Date,
    failureReason: String,
    refundedAmount: { type: Number, default: 0, min: 0 },
    refunds: { type: [RefundSchema], default: [] },
    notes: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Partial, not sparse: sparse still indexes explicit nulls and collides on the
// second one. These two uniques are the whole idempotency story — a replayed
// webhook cannot produce a second paid row for the same gateway payment.
PaymentOrderSchema.index(
  { gatewayOrderId: 1 },
  { unique: true, partialFilterExpression: { gatewayOrderId: { $type: "string" } } },
);
PaymentOrderSchema.index(
  { gatewayPaymentId: 1 },
  { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: "string" } } },
);
PaymentOrderSchema.index({ purpose: 1, refId: 1, status: 1 });
PaymentOrderSchema.index({ userId: 1, createdAt: -1 });
// The retry queue: paid, but the thing paid for never happened.
PaymentOrderSchema.index({ status: 1, fulfilledAt: 1 });

export default mongoose.model<IPaymentOrder>("PaymentOrder", PaymentOrderSchema);
