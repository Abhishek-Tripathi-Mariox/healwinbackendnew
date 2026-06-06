import { Request, Response, NextFunction } from "express";
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

/** Places a call to the contact at `tier` and appends an attempt. */
const dialTier = async (escalation: any, tier: number) => {
  const contact = escalation.contacts.find((c: IIvrContact) => c.tier === tier);
  if (!contact) return false;
  const result = await placeCall(contact.phone, {
    reason: escalation.triggerReason,
    escalationId: String(escalation._id),
  });
  escalation.attempts.push({
    tier,
    phone: contact.phone,
    provider: result.provider,
    providerCallId: result.callId,
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
 * POST /ivr/callback — public provider webhook. Exotel/Twilio post call status
 * here; we locate the escalation by providerCallId and update the attempt. A
 * "completed"/"answered" status acknowledges the escalation (someone picked up).
 */
export const callback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const callId = req.body?.CallSid || req.body?.callId || req.query?.CallSid;
  const rawStatus = String(
    req.body?.Status || req.body?.status || "",
  ).toLowerCase();
  if (!callId) {
    req.rData = { ok: false };
    req.msg = "success";
    return next();
  }
  const escalation = await IvrEscalation.findOne({
    "attempts.providerCallId": callId,
  });
  if (escalation) {
    const attempt = escalation.attempts.find(
      (a) => a.providerCallId === callId,
    );
    if (attempt) {
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
