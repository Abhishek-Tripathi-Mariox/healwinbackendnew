import mongoose, { Schema, Types } from "mongoose";

/**
 * Payment gateway credentials, managed from the admin panel rather than the
 * environment — so keys can be rotated without a redeploy, and a non-developer
 * can switch from test to live keys.
 *
 * `keySecret` and `webhookSecret` are stored ENCRYPTED (see crypto.util) and
 * are never returned to the browser in full — the API masks them.
 */

export type PaymentProvider = "razorpay";

export interface IPaymentSettings {
  _id: Types.ObjectId;
  provider: PaymentProvider;
  keyId: string;
  /** AES-256-GCM ciphertext. */
  keySecret: string;
  /**
   * Signs Razorpay's webhook. Without it a payment is only confirmed when the
   * customer's app calls back — close the app right after paying and the order
   * stays "pending" even though the money was captured.
   */
  webhookSecret: string;
  /** Test keys (rzp_test_…) vs live. Derived from keyId, stored for display. */
  mode: "test" | "live";
  enabled: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSettingsSchema = new Schema<IPaymentSettings>(
  {
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    keyId: { type: String, required: true, trim: true },
    keySecret: { type: String, required: true },
    webhookSecret: { type: String, default: "" },
    mode: { type: String, enum: ["test", "live"], default: "test" },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const PaymentSettings = mongoose.model<IPaymentSettings>(
  "PaymentSettings",
  PaymentSettingsSchema,
);

export default PaymentSettings;
