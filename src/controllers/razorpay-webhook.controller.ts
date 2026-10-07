import crypto from "crypto";
import { Request, Response } from "express";

import { verifyWebhookSignature } from "../services/razorpay.service";
import {
  creditCapturedPayment,
  resolveTopUpUser,
} from "../services/wallet-topup.service";
import {
  markPaymentFailed,
  settleCapturedPayment,
  syncRefundStatus,
} from "../services/checkout.service";
import WalletTransaction from "../models/wallet-transaction.model";
import WebhookEvent from "../models/webhook-event.model";

/**
 * Razorpay webhook.
 *
 * The app's own confirm call is the fast path, but it only happens if the
 * customer's phone survives the round trip — they close the app, lose signal,
 * or the bank page hangs, and the money is taken with nothing recorded. The
 * webhook is what makes every payment eventually correct regardless.
 *
 * Two settlement paths live behind this. Wallet top-ups keep their own
 * service and their own ledger; everything else — rides, orders, bookings,
 * memberships — goes through the generic checkout service. A payment is tried
 * against the generic one first and falls back to top-up, because the generic
 * one can say "not mine" with certainty (it looks for its own id in the
 * order's notes) while top-up resolution is inference.
 *
 * Both are idempotent, so a payment delivered five times is applied once.
 */

/** Razorpay retries anything that is not a 2xx, so handled failures still 200. */
const ack = (res: Response, handled: string) =>
  res.status(200).json({ ok: true, handled });

/**
 * A stable id for this delivery.
 *
 * Razorpay sends `x-razorpay-event-id`, but not from every account or every
 * older integration, so the body's own digest is the fallback — identical
 * bytes are by definition the same event redelivered.
 */
const eventIdFor = (req: Request, raw: string): string => {
  const header = req.headers["x-razorpay-event-id"];
  if (header) return String(header);
  return `sha:${crypto.createHash("sha256").update(raw).digest("hex")}`;
};

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
  const eventId = eventIdFor(req, raw);

  // Claim the event by inserting it. A unique `eventId` means the second
  // delivery of the same event loses this insert — but only a delivery we
  // actually FINISHED is safe to skip. One that errored out left an unhandled
  // row behind, and Razorpay redelivering it is the retry we asked for.
  try {
    await WebhookEvent.create({
      provider: "razorpay",
      eventId,
      event,
      payload: body,
    });
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    const prior = await WebhookEvent.findOne({ provider: "razorpay", eventId })
      .select("handled")
      .lean();
    if (prior?.handled) {
      console.log(`[razorpay-webhook] ${event} ${eventId} — duplicate delivery, skipped`);
      return ack(res, "duplicate");
    }
    console.log(`[razorpay-webhook] ${event} ${eventId} — retrying a delivery that failed`);
  }

  const done = async (result: string, error?: string) => {
    await WebhookEvent.updateOne(
      { provider: "razorpay", eventId },
      { $set: { handled: !error, result, error, processedAt: new Date() } },
    ).catch(() => undefined);
  };

  try {
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;

    if (event === "payment.captured" && payment?.id) {
      // Generic checkout first: it recognises its own orders by the id it put
      // in the notes, so a "not_ours" from it is reliable.
      const generic = await settleCapturedPayment(payment);
      if (generic.reason !== "not_ours") {
        const label = generic.paid ? `applied ₹${generic.amount} to ${generic.purpose}` : generic.reason;
        console.log(`[razorpay-webhook] ${payment.id} → ${label}`);
        await done(generic.paid ? "settled" : String(generic.reason));
        return ack(res, generic.paid ? "settled" : "noop");
      }

      const userId = await resolveTopUpUser(payment);
      if (!userId) {
        await done("not_a_topup");
        return ack(res, "not_a_topup");
      }
      const result = await creditCapturedPayment(userId, payment);
      console.log(
        `[razorpay-webhook] ${payment.id} → ${result.credited ? `credited ₹${result.amount}` : result.reason}`,
      );
      await done(result.credited ? "credited" : "already_credited");
      return ack(res, result.credited ? "credited" : "already_credited");
    }

    if (event === "payment.failed" && payment?.id) {
      const generic = await markPaymentFailed(payment);
      if (!generic) {
        await WalletTransaction.updateOne(
          { referenceId: payment.order_id, status: "PENDING" },
          { $set: { status: "FAILED", description: "Top-up failed at the gateway" } },
        );
      }
      await done("marked_failed");
      return ack(res, "marked_failed");
    }

    if ((event === "refund.processed" || event === "refund.failed") && refund?.id) {
      const synced = await syncRefundStatus(refund);
      await done(synced ? "refund_synced" : "refund_unknown");
      return ack(res, synced ? "refund_synced" : "refund_unknown");
    }
  } catch (e: any) {
    // A 500 makes Razorpay redeliver. The row stays, marked unhandled with the
    // error on it, and the claim above lets the redelivery through.
    console.error("[razorpay-webhook] error:", e?.message || e);
    await done("error", e?.message || String(e));
    return res.status(500).json({ ok: false });
  }

  await done("ignored");
  return ack(res, "ignored");
};
