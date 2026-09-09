import { Request, Response } from "express";
import { verifyWebhookSignature } from "../services/razorpay.service";
import {
  creditCapturedPayment,
  resolveTopUpUser,
} from "../services/wallet-topup.service";
import WalletTransaction from "../models/wallet-transaction.model";

/**
 * Razorpay webhook.
 *
 * The app's own confirm call is the fast path, but it only happens if the
 * customer's phone survives the round trip — they close the app, lose signal,
 * or the bank page hangs, and the money is taken with nothing credited. The
 * webhook is what makes the top-up eventually correct regardless.
 *
 * Both paths funnel into creditCapturedPayment, which is idempotent, so a
 * payment confirmed twice is credited once.
 */

/** Razorpay retries anything that is not a 2xx, so failures must still 200. */
const ack = (res: Response, handled: string) =>
  res.status(200).json({ ok: true, handled });

export const receive = async (req: Request, res: Response) => {
  const signature = String(req.headers["x-razorpay-signature"] || "");
  // Set by the raw-body capture in server.ts. The signature covers the exact
  // bytes Razorpay sent, so re-serialising the parsed object would not match.
  const raw = (req as any).rawBody as string | undefined;

  if (!raw || !signature) {
    // 400, not 200: there is nothing to retry, and silently accepting
    // unsigned posts to a money endpoint is how wallets get inflated.
    return res.status(400).json({ ok: false, error: "missing signature or body" });
  }
  if (!(await verifyWebhookSignature(raw, signature))) {
    console.warn("[razorpay-webhook] rejected: bad signature");
    return res.status(400).json({ ok: false, error: "invalid signature" });
  }

  const body = req.body || {};
  const event = String(body.event || "");
  const payment = body.payload?.payment?.entity;
  if (!payment?.id) return ack(res, "ignored");

  try {
    if (event === "payment.captured") {
      // Who to credit is resolved from our own records — the notes we
      // attached to the order, or the pending row we wrote before the customer
      // paid. Never from anything the caller could choose.
      const userId = await resolveTopUpUser(payment);
      if (!userId) return ack(res, "not_a_topup");

      const result = await creditCapturedPayment(userId, payment);
      console.log(
        `[razorpay-webhook] ${payment.id} → ${result.credited ? `credited ₹${result.amount}` : result.reason}`,
      );
      return ack(res, result.credited ? "credited" : "already_credited");
    }

    if (event === "payment.failed") {
      await WalletTransaction.updateOne(
        { referenceId: payment.order_id, status: "PENDING" },
        { $set: { status: "FAILED", description: "Top-up failed at the gateway" } },
      );
      return ack(res, "marked_failed");
    }
  } catch (e: any) {
    // A 500 makes Razorpay redeliver, which is what we want for a transient
    // database problem — the credit is retried rather than lost.
    console.error("[razorpay-webhook] error:", e?.message || e);
    return res.status(500).json({ ok: false });
  }

  return ack(res, "ignored");
};
