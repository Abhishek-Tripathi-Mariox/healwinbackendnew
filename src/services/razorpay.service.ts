import crypto from "crypto";
import config from "../config";
import PaymentSettings from "../models/payment-settings.model";
import { decryptSecret } from "../utils/crypto.util";

/**
 * Razorpay gateway.
 *
 * Credentials come from the admin panel (PaymentSettings) first and fall back
 * to the environment, so keys can be rotated without a redeploy. The client is
 * rebuilt whenever the stored credentials change, and cached in between —
 * constructing it per request would re-read and re-decrypt on every call.
 *
 * Everything here fails CLOSED. A payment path that silently "succeeds"
 * without a gateway is how a wallet gets credited for money nobody paid.
 */

export interface GatewayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: "test" | "live";
  source: "database" | "environment" | "none";
}

let cached: { creds: GatewayCredentials; client: any } | null = null;

/** Resolve credentials: admin panel first, environment second. */
export const getCredentials = async (): Promise<GatewayCredentials> => {
  const row: any = await PaymentSettings.findOne({ enabled: true })
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);

  if (row?.keyId && row?.keySecret) {
    const keySecret = decryptSecret(row.keySecret);
    if (keySecret) {
      return {
        keyId: row.keyId,
        keySecret,
        webhookSecret: decryptSecret(row.webhookSecret || ""),
        mode: row.mode || (row.keyId.includes("_test_") ? "test" : "live"),
        source: "database",
      };
    }
  }

  const envId = config.payment.razorpayKeyId;
  const envSecret = config.payment.razorpayKeySecret;
  if (envId && envSecret) {
    return {
      keyId: envId,
      keySecret: envSecret,
      webhookSecret:
        process.env.RAZORPAY_WEBHOOK_SECRET || config.payment.webhookSecret || "",
      mode: envId.includes("_test_") ? "test" : "live",
      source: "environment",
    };
  }

  return { keyId: "", keySecret: "", webhookSecret: "", mode: "test", source: "none" };
};

export const isConfigured = async (): Promise<boolean> =>
  (await getCredentials()).source !== "none";

/** The SDK client, or null when no credentials are configured. */
export const getClient = async (): Promise<any | null> => {
  const creds = await getCredentials();
  if (creds.source === "none") return null;
  if (
    cached &&
    cached.creds.keyId === creds.keyId &&
    cached.creds.keySecret === creds.keySecret
  ) {
    return cached.client;
  }
  try {
    // Required lazily so a missing SDK degrades to "not configured" rather
    // than crashing the server at boot.
    const Razorpay = require("razorpay");
    const client = new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
    cached = { creds, client };
    return client;
  } catch (err: any) {
    console.error("[razorpay] SDK unavailable:", err?.message);
    return null;
  }
};

/** Drop the cached client — call after credentials are saved. */
export const resetClient = (): void => {
  cached = null;
};

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

/**
 * Create an order to be paid. Amount is in RUPEES; Razorpay works in paise.
 */
export const createOrder = async (
  amountRupees: number,
  receipt: string,
  notes: Record<string, string> = {},
): Promise<CreatedOrder> => {
  const client = await getClient();
  if (!client) {
    throw new Error(
      "Payments are not configured. Add your gateway keys under System → Payment Config.",
    );
  }
  const creds = await getCredentials();
  const order = await client.orders.create({
    amount: Math.round(amountRupees * 100),
    currency: "INR",
    receipt,
    notes,
  });
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    // The app needs the PUBLIC key id to open the checkout sheet.
    keyId: creds.keyId,
  };
};

/**
 * Verify a checkout callback.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. Compared in
 * constant time — a timing-variable compare on a payment signature is how
 * forged callbacks get through.
 */
export const verifyPaymentSignature = async (params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> => {
  const { keySecret } = await getCredentials();
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(params.signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Verify a webhook body against the webhook secret. */
export const verifyWebhookSignature = async (
  rawBody: string,
  signature: string,
): Promise<boolean> => {
  const { webhookSecret } = await getCredentials();
  if (!webhookSecret) return false;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Ask the gateway what it thinks a payment's state is. */
export const fetchPayment = async (paymentId: string): Promise<any | null> => {
  const client = await getClient();
  if (!client) return null;
  try {
    return await client.payments.fetch(paymentId);
  } catch (err: any) {
    console.error("[razorpay] fetchPayment failed:", err?.message);
    return null;
  }
};

export default {
  getCredentials,
  isConfigured,
  getClient,
  resetClient,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
};
