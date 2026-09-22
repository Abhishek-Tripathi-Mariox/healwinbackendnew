import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import CallLog from "../../models/call-log.model";
import { Admin } from "../../models/admin.model";
import config from "../../config";
import {
  clickToCall,
  isConfigured,
  usesUserDial,
  tenDigits,
} from "../../services/myoperator.service";

/**
 * Call management — the panel side of the MyOperator integration.
 *
 * Click-to-call places a bridge and logs the attempt immediately, so a call
 * that the provider never confirms still leaves a trace. The webhook later
 * fills in duration, outcome and the recording against the same row.
 */

const SUBJECTS = [
  "sos_submission",
  "ambulance_request",
  "emergency_dispatch",
  "patient",
  "hospital_patient",
  "application",
  "employee",
  "other",
];

/**
 * The three kinds of call, as separate views.
 *
 * They are different things to look at: an IVR recording is a customer
 * navigating the menu, a click-to-call recording is an agent's own outbound
 * conversation, and a plain inbound call is neither. Mixed into one list the
 * recordings are impossible to tell apart without opening them.
 *
 * IVR is identified by the flow/input the provider reports rather than by
 * direction — an IVR call arrives as `inbound`, so direction alone cannot
 * separate it from a normal incoming call.
 */
const HAS_IVR = {
  $or: [
    { ivrFlow: { $nin: [null, ""] } },
    { ivrInput: { $nin: [null, ""] } },
  ],
};
const NO_IVR = {
  $and: [
    { $or: [{ ivrFlow: { $in: [null, ""] } }, { ivrFlow: { $exists: false } }] },
    { $or: [{ ivrInput: { $in: [null, ""] } }, { ivrInput: { $exists: false } }] },
  ],
};

export const KIND_FILTERS: Record<string, any> = {
  ivr: HAS_IVR,
  click_to_call: { direction: "click_to_call" },
  // A plain incoming call — inbound, but not one that went through the menu.
  inbound: { $and: [{ direction: "inbound" }, NO_IVR] },
};

/** GET /admin/calls — the call log, newest first. */
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10)));

  const query: any = {};

  /**
   * Conditions that each need their own `$or` are collected here and combined
   * under one `$and`. Assigning `query.$or` twice — once for the kind, once for
   * the search box — would silently drop the first: the second assignment
   * simply overwrites it, and the list would quietly ignore the tab.
   */
  const and: any[] = [];

  const kind = String(req.query.kind || "");
  if (kind && KIND_FILTERS[kind]) and.push(KIND_FILTERS[kind]);

  if (req.query.direction) query.direction = String(req.query.direction);
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.subjectType) query.subjectType = String(req.query.subjectType);
  if (req.query.subjectId) query.subjectId = req.query.subjectId;
  if (req.query.hasRecording === "true") {
    query.recordingUrl = { $exists: true, $nin: ["", null] };
  }
  if (req.query.search) {
    // Escaped: a stray "(" in a search box must not become a broken regex,
    // and a crafted one must not become a CPU-burning backtrack.
    const raw = String(req.query.search).trim();
    const rx = new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    and.push({
      $or: [
        { customerNumber: rx },
        { agentNumber: rx },
        { subjectLabel: rx },
        { agentName: rx },
      ],
    });
  }
  if (req.query.dateFrom || req.query.dateTo) {
    query.createdAt = {};
    if (req.query.dateFrom) query.createdAt.$gte = new Date(String(req.query.dateFrom));
    if (req.query.dateTo) {
      const end = new Date(String(req.query.dateTo));
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  if (and.length) query.$and = and;

  const [items, total] = await Promise.all([
    CallLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      // rawPayloads can be large and is only needed on the detail view.
      .select("-rawPayloads")
      .populate("placedByAdminId", "fullName email")
      .lean(),
    CallLog.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    configured: isConfigured(),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/calls/:id — one call, including the raw provider payloads. */
export const detail = async (req: Request, _res: Response, next: NextFunction) => {
  const item = await CallLog.findById(req.params.id as string)
    .populate("placedByAdminId", "fullName email")
    .lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { item };
  req.msg = "success";
  return next();
};

/**
 * POST /admin/calls/click-to-call
 * body: { customerNumber, agentNumber?, subjectType?, subjectId?, subjectLabel? }
 *
 * Rings the agent, then bridges to the customer. The agent number is taken
 * from the signed-in admin's profile so each person is called on their own
 * phone; the control-room number is only the fallback.
 */
export const placeCall = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  const customerNumber = tenDigits(String(b.customerNumber || ""));
  if (customerNumber.length !== 10) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "a valid 10-digit customer number is required" };
    return next();
  }
  if (b.subjectType && !SUBJECTS.includes(String(b.subjectType))) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `subjectType must be one of: ${SUBJECTS.join(", ")}` };
    return next();
  }

  let agentNumber = tenDigits(String(b.agentNumber || ""));
  if (!agentNumber && adminId) {
    const admin: any = await Admin.findById(adminId).select("phone mobileNumber").lean();
    agentNumber = tenDigits(String(admin?.phone || admin?.mobileNumber || ""));
  }
  if (!agentNumber) agentNumber = tenDigits(String(config.ivr.operatorNumber || ""));
  if (agentNumber.length !== 10 && !usesUserDial()) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint:
        "no agent number to ring — add a mobile number to your admin profile, " +
        "or set IVR_OPERATOR_NUMBER for the control room",
    };
    return next();
  }

  if (!isConfigured()) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint:
        "MyOperator is not configured — set MYOPERATOR_API_KEY, MYOPERATOR_COMPANY_ID, " +
        "MYOPERATOR_SECRET_TOKEN and MYOPERATOR_PUBLIC_IVR_ID in the backend .env",
      notConfigured: true,
    };
    return next();
  }

  const refId = randomUUID();
  const result = await clickToCall(agentNumber, customerNumber, refId);

  // Log the attempt whether or not it succeeded: a failed bridge is exactly
  // the thing someone will need to see afterwards.
  const log = await CallLog.create({
    provider: result.provider,
    providerCallId: result.callId,
    refId,
    direction: "click_to_call",
    status: result.status === "placed" ? "initiated" : "failed",
    customerNumber,
    agentNumber,
    placedByAdminId: adminId,
    subjectType: b.subjectType || "other",
    subjectId: b.subjectId || undefined,
    subjectLabel: b.subjectLabel || undefined,
    notes: result.note,
    startedAt: new Date(),
  });

  if (result.status !== "placed") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: result.note || "the call could not be placed", callId: String(log._id) };
    return next();
  }

  req.rData = { call: log, agentNumber };
  req.msg = "call_placed";
  return next();
};

/** PUT /admin/calls/:id/notes — outcome notes against a call. */
export const saveNotes = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const item = await CallLog.findByIdAndUpdate(
    req.params.id as string,
    { notes: String(req.body?.notes || "") },
    { returnDocument: "after" },
  ).lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { item };
  req.msg = "saved";
  return next();
};

/** GET /admin/calls/stats — headline counts for the page header. */
export const stats = async (req: Request, _res: Response, next: NextFunction) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const HAS_RECORDING = { recordingUrl: { $exists: true, $nin: ["", null] } };
  /** Count a kind, optionally only the ones carrying a recording. */
  const ofKind = (kind: string, recordedOnly = false) =>
    CallLog.countDocuments(
      recordedOnly
        ? { $and: [KIND_FILTERS[kind], HAS_RECORDING] }
        : KIND_FILTERS[kind],
    );

  const [
    today,
    missedToday,
    recorded,
    total,
    ivr,
    ivrRecorded,
    clickToCall,
    clickToCallRecorded,
    inbound,
    inboundRecorded,
  ] = await Promise.all([
    CallLog.countDocuments({ createdAt: { $gte: since } }),
    CallLog.countDocuments({
      createdAt: { $gte: since },
      status: { $in: ["missed", "no_answer"] },
    }),
    CallLog.countDocuments(HAS_RECORDING),
    CallLog.countDocuments({}),
    ofKind("ivr"),
    ofKind("ivr", true),
    ofKind("click_to_call"),
    ofKind("click_to_call", true),
    ofKind("inbound"),
    ofKind("inbound", true),
  ]);

  req.rData = {
    today,
    missedToday,
    recorded,
    total,
    // Per-tab totals, so each tab can say how many calls and how many
    // recordings it holds before you open it.
    byKind: {
      all: { calls: total, recordings: recorded },
      ivr: { calls: ivr, recordings: ivrRecorded },
      click_to_call: { calls: clickToCall, recordings: clickToCallRecorded },
      inbound: { calls: inbound, recordings: inboundRecorded },
    },
    configured: isConfigured(),
  };
  req.msg = "success";
  return next();
};
