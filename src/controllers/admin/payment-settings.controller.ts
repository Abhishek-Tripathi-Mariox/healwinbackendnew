import { Request, Response, NextFunction } from "express";
import PaymentSettings from "../../models/payment-settings.model";
import { encryptSecret, decryptSecret, maskSecret } from "../../utils/crypto.util";
import {
  getCredentials,
  getClient,
  resetClient,
} from "../../services/razorpay.service";

/**
 * Payment gateway configuration.
 *
 * Secrets are encrypted at rest and NEVER returned in full — the screen shows
 * a masked value so an admin can confirm which key is in use without the page
 * (or anyone shoulder-surfing it) exposing the credential.
 */

/** The public URL Razorpay should post to, as seen from this request. */
const webhookUrl = (req: Request): string => {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").trim();
  if (!host) return "/v1/api/webhooks/razorpay";
  return `${proto}://${host}/v1/api/webhooks/razorpay`;
};

/** GET /admin/payment-settings */
export const get = async (req: Request, _res: Response, next: NextFunction) => {
  const row: any = await PaymentSettings.findOne().sort({ updatedAt: -1 }).lean();
  const creds = await getCredentials();

  req.rData = {
    configured: creds.source !== "none",
    // Which credentials are actually in force — the panel's, or the server's
    // environment. Without this it is impossible to tell why a key you just
    // saved is not the one being used.
    source: creds.source,
    provider: row?.provider || "razorpay",
    keyId: row?.keyId || creds.keyId || "",
    keySecretMasked: row?.keySecret ? maskSecret(decryptSecret(row.keySecret)) : "",
    webhookConfigured: !!(row?.webhookSecret || creds.webhookSecret),
    mode: creds.mode,
    enabled: row?.enabled ?? true,
    updatedAt: row?.updatedAt || null,
    // Built from the request the admin panel actually reached us on, so it is
    // the API's own host — NOT the panel's, which in production is a different
    // domain entirely and would be pasted into Razorpay as a dead URL.
    webhookUrl: webhookUrl(req),
    webhookPath: "/v1/api/webhooks/razorpay",
    webhookEvents: ["payment.captured", "payment.failed"],
  };
  req.msg = "success";
  return next();
};

/** PUT /admin/payment-settings */
export const update = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const keyId = String(b.keyId || "").trim();
  const keySecret = String(b.keySecret || "").trim();

  if (!keyId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Key ID is required." };
    return next();
  }
  // A Razorpay key id always looks like rzp_test_… or rzp_live_…. Catching it
  // here stops the confusing failure where an email address or the secret has
  // been pasted into the wrong box and every payment fails at the gateway.
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: 'Key ID must look like "rzp_test_XXXXXXXX" or "rzp_live_XXXXXXXX" — copy it from Razorpay → Settings → API Keys.',
    };
    return next();
  }

  const existing: any = await PaymentSettings.findOne().sort({ updatedAt: -1 });
  // Blank secret on an update = "leave it as it is", so an admin can change
  // the key id or the webhook without re-typing the secret.
  if (!keySecret && !existing?.keySecret) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Key Secret is required the first time." };
    return next();
  }

  const payload: any = {
    provider: "razorpay",
    keyId,
    mode: keyId.includes("_test_") ? "test" : "live",
    enabled: b.enabled !== false,
    updatedBy: adminId,
  };
  if (keySecret) payload.keySecret = encryptSecret(keySecret);
  if (b.webhookSecret !== undefined) {
    payload.webhookSecret = b.webhookSecret
      ? encryptSecret(String(b.webhookSecret).trim())
      : "";
  }

  const saved = existing
    ? await PaymentSettings.findByIdAndUpdate(existing._id, payload, { new: true })
    : await PaymentSettings.create(payload);

  // The gateway client caches its credentials — drop it so the next payment
  // uses what was just saved rather than the previous keys.
  resetClient();

  req.rData = {
    saved: true,
    mode: saved?.mode,
    warning:
      saved?.mode === "live"
        ? "These are LIVE keys — real money will be charged."
        : undefined,
  };
  req.msg = "saved";
  return next();
};

/**
 * POST /admin/payment-settings/test — prove the keys work.
 *
 * Lists one order, which authenticates against Razorpay without creating or
 * charging anything.
 */
export const test = async (req: Request, _res: Response, next: NextFunction) => {
  const client = await getClient();
  if (!client) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "No payment credentials are configured yet." };
    return next();
  }
  try {
    await client.orders.all({ count: 1 });
    const creds = await getCredentials();
    req.rData = {
      ok: true,
      mode: creds.mode,
      message: `Connected to Razorpay in ${creds.mode.toUpperCase()} mode.`,
    };
    req.msg = "success";
  } catch (e: any) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint:
        e?.error?.description ||
        e?.message ||
        "Razorpay rejected these credentials. Check the Key ID and Secret.",
    };
  }
  return next();
};
