import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import IvrEscalation from "../models/ivr-escalation.model";
import type { IIvrContact } from "../models/ivr-escalation.model";
import { placeCall } from "../services/ivr.service";

/**
 * IVR escalation — admin-driven automated phone-tree for unacknowledged SOS.
 * Places calls tier by tier through a provider adapter and journals attempts.
 */

const normalizeContacts = (raw: any): IIvrContact[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((c) => c && c.phone)
    .map((c, i) => ({
      tier: Number(c.tier) || i + 1,
      name: c.name || undefined,
      phone: String(c.phone).trim(),
      role: c.role || undefined,
    }))
    .sort((a, b) => a.tier - b.tier);

/**
 * Places a call to the contact at `tier` and appends an attempt.
 *
 * `refId` is generated per-attempt (not per-escalation) and handed to the
 * provider as its reference_id/refid — some providers (MyOperator, MCube)
 * don't return a usable call ID at placement time, so this is what the
 * status/recording webhook echoes back to let us match it to this exact
 * attempt (see `callback` below).
 */
export const dialTier = async (escalation: any, tier: number) => {
  const contact = escalation.contacts.find((c: IIvrContact) => c.tier === tier);
  if (!contact) return false;
  const refId = randomUUID();
  const result = await placeCall(contact.phone, {
    reason: escalation.triggerReason,
    escalationId: String(escalation._id),
    refId,
  });
  escalation.attempts.push({
    tier,
    phone: contact.phone,
    provider: result.provider,
    providerCallId: result.callId,
    refId,
    status: result.status === "placed" ? "placed" : "failed",
    note: result.note,
    at: new Date(),
  });
  escalation.currentTier = tier;
  return true;
};

/**
 * POST /admin/ivr-escalations — start an escalation and dial the first tier.
 * body: { sosSubmission?, emergencyDispatch?, triggerReason?, contacts: [...] }
 */
export const start = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const contacts = normalizeContacts(b.contacts);
  if (contacts.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "at least one contact { tier, phone } is required" };
    return next();
  }

  const escalation = new IvrEscalation({
    sosSubmission: b.sosSubmission || undefined,
    emergencyDispatch: b.emergencyDispatch || undefined,
    triggerReason: b.triggerReason || undefined,
    contacts,
    status: "in_progress",
    startedByAdminId: adminId,
  });
  await dialTier(escalation, contacts[0].tier);
  await escalation.save();

  req.rData = { escalation };
  req.msg = "escalation_started";
  return next();
};

/** POST /admin/ivr-escalations/:id/advance — dial the next tier. */
export const advance = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const escalation = await IvrEscalation.findById(req.params.id);
  if (!escalation) {
    req.rCode = 5;
    req.msg = "escalation_not_found";
    req.rData = {};
    return next();
  }
  if (escalation.status === "acknowledged" || escalation.status === "cancelled") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `escalation already ${escalation.status}` };
    return next();
  }

  const tiers = escalation.contacts
    .map((c) => c.tier)
    .sort((a, b) => a - b);
  const nextTier = tiers.find((t) => t > escalation.currentTier);
  if (nextTier == null) {
    escalation.status = "exhausted";
    await escalation.save();
    req.rData = { escalation };
    req.msg = "escalation_updated";
    return next();
  }

  escalation.status = "in_progress";
  await dialTier(escalation, nextTier);
  await escalation.save();

  req.rData = { escalation };
  req.msg = "escalation_updated";
  return next();
};

/**
 * POST /admin/ivr-escalations/:id/call/:tier — place a call to that tier's
 * contact right now (on demand), independent of the automatic tier
 * progression. Journals the attempt like any other call.
 */
export const callNow = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const escalation = await IvrEscalation.findById(req.params.id);
  if (!escalation) {
    req.rCode = 5;
    req.msg = "escalation_not_found";
    req.rData = {};
    return next();
  }
  const tier = Number(req.params.tier);
  const ok = await dialTier(escalation, tier);
  if (!ok) {
    req.rCode = 5;
    req.msg = "tier_not_found";
    req.rData = {};
    return next();
  }
  if (escalation.status !== "acknowledged" && escalation.status !== "cancelled") {
    escalation.status = "in_progress";
  }
  await escalation.save();
  req.rData = { escalation };
  req.msg = "escalation_updated";
  return next();
};

/** POST /admin/ivr-escalations/:id/acknowledge */
export const acknowledge = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const escalation = await IvrEscalation.findById(req.params.id);
  if (!escalation) {
    req.rCode = 5;
    req.msg = "escalation_not_found";
    req.rData = {};
    return next();
  }
  escalation.status = "acknowledged";
  escalation.acknowledgedByPhone = req.body?.phone || undefined;
  escalation.acknowledgedAt = new Date();
  const last = escalation.attempts[escalation.attempts.length - 1];
  if (last) last.status = "answered";
  await escalation.save();
  req.rData = { escalation };
  req.msg = "escalation_updated";
  return next();
};

/** POST /admin/ivr-escalations/:id/cancel */
export const cancel = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const escalation = await IvrEscalation.findById(req.params.id);
  if (!escalation) {
    req.rCode = 5;
    req.msg = "escalation_not_found";
    req.rData = {};
    return next();
  }
  escalation.status = "cancelled";
  await escalation.save();
  req.rData = { escalation };
  req.msg = "escalation_updated";
  return next();
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  const [items, total] = await Promise.all([
    IvrEscalation.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    IvrEscalation.countDocuments(query),
  ]);
  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "escalation_list";
  return next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const escalation = await IvrEscalation.findById(req.params.id).lean();
  if (!escalation) {
    req.rCode = 5;
    req.msg = "escalation_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { escalation };
  req.msg = "escalation_detail";
  return next();
};

/**
 * POST /ivr/callback — public provider webhook (Exotel/Twilio/MCube/
 * MyOperator all post here — point whichever one is active at this URL from
 * its dashboard). We locate the attempt by providerCallId (if the provider
 * returned one when the call was placed) or by refId (the UUID we generated
 * and handed the provider as reference_id/refid — most providers echo this
 * back even when they don't expose their own call ID). Recording URL field
 * names vary by provider, so several plausible ones are checked. A
 * "completed"/"answered" status acknowledges the escalation (someone picked up).
 */
export const callback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const q = req.query || {};
  const callId =
    b.CallSid || b.callId || b.call_id || b.callid || q.CallSid || undefined;
  const refId =
    b.refId || b.refid || b.reference_id || b.ref_id || q.refId || q.reference_id || undefined;
  const rawStatus = String(
    b.Status || b.status || b.call_status || b.event_type || "",
  ).toLowerCase();
  const recordingUrl =
    b.recording_url ||
    b.recordingUrl ||
    b.RecordingUrl ||
    b.RecordingURL ||
    b.call_recording_url ||
    b.recording ||
    undefined;

  if (!callId && !refId) {
    req.rData = { ok: false };
    req.msg = "success";
    return next();
  }

  const escalation = await IvrEscalation.findOne(
    callId && refId
      ? { $or: [{ "attempts.providerCallId": callId }, { "attempts.refId": refId }] }
      : callId
        ? { "attempts.providerCallId": callId }
        : { "attempts.refId": refId },
  );
  if (escalation) {
    const attempt = escalation.attempts.find(
      (a) => (callId && a.providerCallId === callId) || (refId && a.refId === refId),
    );
    if (attempt) {
      // A provider that only echoes refId at placement time may still send
      // its own call ID in the status webhook — capture it if we don't have
      // one yet, so a later recording-only webhook keyed on callId can match.
      if (callId && !attempt.providerCallId) attempt.providerCallId = callId;
      if (recordingUrl) attempt.recordingUrl = recordingUrl;
      if (["completed", "answered", "in-progress"].includes(rawStatus)) {
        attempt.status = "answered";
        if (escalation.status === "in_progress") {
          escalation.status = "acknowledged";
          escalation.acknowledgedAt = new Date();
          escalation.acknowledgedByPhone = attempt.phone;
        }
      } else if (["no-answer", "busy", "failed"].includes(rawStatus)) {
        attempt.status = rawStatus === "failed" ? "failed" : "no_answer";
      }
      await escalation.save();
    }
  }
  req.rData = { ok: true };
  req.msg = "success";
  return next();
};
