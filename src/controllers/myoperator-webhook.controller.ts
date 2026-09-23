import { Request, Response } from "express";
import crypto from "crypto";
import CallLog from "../models/call-log.model";
import config from "../config";
import { normalizeWebhook } from "../services/myoperator.service";

/**
 * MyOperator webhook — every call event and recording lands here.
 *
 * Point MyOperator's callback URL at:
 *   POST  https://<your-domain>/v1/api/webhooks/myoperator?token=<MYOPERATOR_WEBHOOK_TOKEN>
 *
 * The endpoint is public (MyOperator's servers cannot hold an admin session),
 * so it is protected by a shared token instead. It is deliberately forgiving:
 * a malformed or unrecognised payload is stored and acknowledged rather than
 * rejected, because providers retry on non-2xx and a retry storm is worse than
 * an odd row in the log. Anything genuinely unusable is still answered 200 and
 * recorded, so nothing is lost silently.
 */

/** Constant-time compare so the token can't be guessed by timing the response. */
const tokenMatches = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * How far along a call is. Webhook events can arrive out of order (and a
 * recording event carries no state at all), so a status only ever moves
 * forward — a late "ringing" must not undo "answered".
 */
const STATUS_RANK: Record<string, number> = {
  initiated: 0,
  ringing: 1,
  answered: 2,
  completed: 3,
  missed: 3,
  busy: 3,
  failed: 3,
  no_answer: 3,
  cancelled: 3,
};

/** Event types already dumped in full to the log (once each per process). */
const loggedEventTypes = new Set<string>();

export const receive = async (req: Request, res: Response) => {
  const expected = config.ivr.myOperatorWebhookToken;
  if (expected) {
    const given = String(
      req.query.token || req.headers["x-webhook-token"] || "",
    );
    if (!given || !tokenMatches(given, expected)) {
      // A wrong token is a real rejection — unlike a malformed body, there is
      // nothing to retry into and it should be visible in MyOperator's logs.
      return res.status(401).json({ success: false, message: "invalid webhook token" });
    }
  }

  const body: any =
    req.body && Object.keys(req.body).length ? req.body : req.query;
  const call = normalizeWebhook(body);

  // Print the first payload of each event type in full, so the exact field
  // names MyOperator uses can be read off the server log.
  const evKey = call?.eventType || (call ? "legacy" : "unrecognised");
  if (!loggedEventTypes.has(evKey)) {
    loggedEventTypes.add(evKey);
    console.log(`[myoperator] first "${evKey}" payload:`, JSON.stringify(body).slice(0, 4000));
  }

  if (!call) {
    // Unparseable, but still acknowledged: MyOperator retries on failure and
    // we would rather investigate one stored oddity than absorb a retry loop.
    console.warn("[myoperator] unrecognised webhook payload:", JSON.stringify(body).slice(0, 400));
    return res.json({ success: true, message: "received (unrecognised payload)" });
  }

  try {
    // Match an existing row: the provider's own id first, then the reference
    // we handed it when placing a click-to-call. Without the refId fallback a
    // click-to-call would be logged twice — once by us, once by the callback.
    const or: any[] = [];
    if (call.providerCallId) or.push({ providerCallId: call.providerCallId });
    if (call.refId) or.push({ refId: call.refId });

    let existing = or.length ? await CallLog.findOne({ $or: or }) : null;

    // A click-to-call we placed is logged before MyOperator knows about it.
    // If the events don't echo our reference id back, attach them to the
    // most recent still-unlinked click-to-call to the same number instead
    // of creating a duplicate row.
    if (!existing) {
      existing = await CallLog.findOne({
        direction: "click_to_call",
        customerNumber: call.customerNumber,
        providerCallId: { $exists: false },
        createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      }).sort({ createdAt: -1 });
    }

    const patch: any = {
      provider: "myoperator",
      customerNumber: call.customerNumber,
    };
    if (
      call.status &&
      (!existing ||
        (STATUS_RANK[call.status] ?? 0) >= (STATUS_RANK[existing.status] ?? 0))
    ) {
      patch.status = call.status;
    }
    // Only overwrite with values the provider actually sent — a later
    // recording callback carries few fields, and must not blank the rest.
    const maybe: [string, any][] = [
      ["providerCallId", call.providerCallId],
      ["agentNumber", call.agentNumber],
      ["didNumber", call.didNumber],
      ["ivrFlow", call.ivrFlow],
      ["ivrInput", call.ivrInput],
      ["agentName", call.agentName],
      ["startedAt", call.startedAt],
      ["answeredAt", call.answeredAt],
      ["endedAt", call.endedAt],
      ["recordingUrl", call.recordingUrl],
    ];
    for (const [k, v] of maybe) if (v !== undefined && v !== "") patch[k] = v;
    if (call.durationSeconds > 0) patch.durationSeconds = call.durationSeconds;
    if (call.ringSeconds > 0) patch.ringSeconds = call.ringSeconds;

    if (existing) {
      existing.set(patch);
      existing.rawPayloads = [...(existing.rawPayloads || []), body].slice(-20);
      await existing.save();
      return res.json({ success: true, data: { callId: String(existing._id), updated: true } });
    }

    const created = await CallLog.create({
      status: "initiated",
      ...patch,
      refId: call.refId,
      direction: call.direction,
      rawPayloads: [body],
    });
    return res.json({ success: true, data: { callId: String(created._id), created: true } });
  } catch (err: any) {
    // Still a 200: a duplicate-key race between two near-simultaneous events
    // for the same call is expected, and a 500 would make MyOperator retry it.
    console.error("[myoperator] webhook store failed:", err?.message);
    return res.json({ success: true, message: "received" });
  }
};

/**
 * GET /webhooks/myoperator — MyOperator (and humans) probe the URL before
 * saving it. Answer plainly so a misconfigured URL is obvious from a browser.
 */
export const verify = async (req: Request, res: Response) => {
  return res.json({
    success: true,
    message: "Healwin MyOperator webhook is live. POST call events here.",
    tokenRequired: !!config.ivr.myOperatorWebhookToken,
  });
};
