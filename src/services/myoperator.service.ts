import config from "../config";
import { CallDirection, CallStatus } from "../models/call-log.model";

/**
 * MyOperator adapter — click-to-call out, and webhook normalisation in.
 *
 * Two things live here because they are two halves of one integration: we ask
 * MyOperator to bridge a call, and MyOperator tells us what happened to it.
 *
 * Every network call is best-effort and returns a result rather than throwing.
 * A telephony outage must never take down the panel action that triggered it.
 */

export interface PlaceCallResult {
  provider: string;
  callId?: string;
  status: "placed" | "failed";
  note?: string;
}

/** Keep the last 10 digits — MyOperator wants a bare Indian mobile number. */
export const tenDigits = (phone: string): string =>
  String(phone || "").replace(/\D/g, "").slice(-10);

export const isConfigured = (): boolean => {
  const c = config.ivr;
  return !!(
    c.myOperatorApiKey &&
    c.myOperatorCompanyId &&
    c.myOperatorSecretToken &&
    c.myOperatorPublicIvrId
  );
};

/**
 * "User dial" is always possible when a fixed MYOPERATOR_USER_ID is set; the
 * agent phone number is then optional. Otherwise the agent's number is needed
 * to find their MyOperator user (or, failing that, for anonymous dial).
 */
export const usesUserDial = (): boolean => !!config.ivr.myOperatorUserId;

/* ────────────── MyOperator users (phone → user) ────────────── */

export interface MyOperatorUser {
  userId: string;
  uuid: string;
  name: string;
  numbers: string[]; // last-10-digit contact + alternate numbers
}

const USERS_URL = "https://developers.myoperator.co/user";
const USERS_TTL_MS = 10 * 60 * 1000;
let usersCache: { at: number; users: MyOperatorUser[] } | null = null;

/**
 * Every enabled user on the MyOperator account, cached for 10 minutes so a
 * busy control room isn't hitting MyOperator on every click. Needs
 * MYOPERATOR_AUTH_TOKEN (the "Authentication" value on MyOperator's
 * Developer API → Calling page).
 */
export const listUsers = async (force = false): Promise<MyOperatorUser[]> => {
  const token = config.ivr.myOperatorAuthToken;
  if (!token) return [];
  if (!force && usersCache && Date.now() - usersCache.at < USERS_TTL_MS) {
    return usersCache.users;
  }
  const fetchFn: any = (globalThis as any).fetch;
  const users: MyOperatorUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const resp = await fetchFn(
      `${USERS_URL}?token=${encodeURIComponent(token)}&page=${page}`,
    );
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.status !== "success") {
      throw new Error(`MyOperator user list failed: ${data?.message || resp.status}`);
    }
    const rows: any[] = Array.isArray(data.data) ? data.data : [];
    for (const u of rows) {
      if (String(u.is_enabled) !== "1") continue;
      users.push({
        userId: String(u.user_id || ""),
        uuid: String(u.uuid || ""),
        name: String(u.name || ""),
        numbers: [u.contact_number, u.alternate_number]
          .map((n) => tenDigits(String(n || "")))
          .filter((n) => n.length === 10),
      });
    }
    if (rows.length === 0 || !data.next_page) break;
  }
  usersCache = { at: Date.now(), users };
  return users;
};

/** The MyOperator user whose contact (or alternate) number is `phone`. */
export const findUserByPhone = async (
  phone: string,
): Promise<MyOperatorUser | null> => {
  const ten = tenDigits(phone);
  if (ten.length !== 10) return null;
  const match = (list: MyOperatorUser[]) =>
    list.find((u) => u.numbers.includes(ten)) || null;
  const hit = match(await listUsers());
  // A user added in MyOperator a minute ago isn't in the cache yet.
  return hit || match(await listUsers(true));
};

/**
 * Click-to-call: MyOperator rings the agent first and, when they pick up,
 * bridges them to `customerNumber`.
 *
 * That order matters — the agent is already at their desk, so ringing them
 * first means the patient's phone only rings when a human is genuinely on the
 * line, instead of the patient answering to silence.
 *
 * Who the "agent" is, in order:
 *   1. MYOPERATOR_USER_ID, when set — one fixed MyOperator user for everyone.
 *   2. The MyOperator user whose number matches `agentNumber` (looked up via
 *      MyOperator's user list) — each admin rings on their own phone.
 *   3. Anonymous dial with `agentNumber` — only works if MyOperator has
 *      enabled that feature on the account.
 */
export const clickToCall = async (
  agentNumber: string,
  customerNumber: string,
  refId: string,
): Promise<PlaceCallResult> => {
  const {
    myOperatorApiUrl,
    myOperatorApiKey,
    myOperatorCompanyId,
    myOperatorSecretToken,
    myOperatorCallType,
    myOperatorPublicIvrId,
    myOperatorUserId,
    myOperatorAuthToken,
  } = config.ivr;

  if (!isConfigured()) {
    return {
      provider: "myoperator",
      status: "failed",
      note:
        "MyOperator is not configured — set MYOPERATOR_API_KEY, MYOPERATOR_COMPANY_ID, " +
        "MYOPERATOR_SECRET_TOKEN and MYOPERATOR_PUBLIC_IVR_ID in the backend .env",
    };
  }
  const agent = tenDigits(agentNumber);
  const customer = tenDigits(customerNumber);
  if (customer.length !== 10) {
    return { provider: "myoperator", status: "failed", note: "invalid customer number" };
  }

  const fetchFn: any = (globalThis as any).fetch;
  if (!fetchFn) {
    return { provider: "myoperator", status: "failed", note: "fetch unavailable" };
  }

  // Resolve who MyOperator should ring first.
  let userIds: string[] = [];
  if (myOperatorUserId) {
    userIds = [myOperatorUserId];
  } else if (myOperatorAuthToken && agent.length === 10) {
    try {
      const user = await findUserByPhone(agent);
      if (!user) {
        return {
          provider: "myoperator",
          status: "failed",
          note:
            `The number ${agent} is not a user in MyOperator — add it under ` +
            "MyOperator → Manage → Users (or fix the mobile number on your admin profile)",
        };
      }
      // MyOperator's docs don't say which of the two ids OBD expects; try
      // user_id first and fall back to uuid if MyOperator rejects it.
      userIds = [user.userId, user.uuid].filter(Boolean);
    } catch (err: any) {
      return {
        provider: "myoperator",
        status: "failed",
        note: err?.message || "Could not read MyOperator users",
      };
    }
  } else if (agent.length !== 10) {
    return { provider: "myoperator", status: "failed", note: "invalid agent number" };
  }

  const place = async (userId?: string) => {
    const resp = await fetchFn(myOperatorApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": myOperatorApiKey,
      },
      body: JSON.stringify({
        company_id: myOperatorCompanyId,
        secret_token: myOperatorSecretToken,
        type: myOperatorCallType,
        public_ivr_id: myOperatorPublicIvrId,
        reference_id: refId,
        // E.164, as in MyOperator's own examples ("+919876543210").
        ...(userId
          ? // User dial: MyOperator rings this panel user, then the customer.
            { user_id: userId, number: `+91${customer}` }
          : // Anonymous dial: ring agent number, then bridge to customer.
            { number: `+91${agent}`, number_2: `+91${customer}` }),
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    return { resp, data };
  };

  try {
    let { resp, data } = await place(userIds[0]);
    if (
      !resp.ok &&
      userIds.length > 1 &&
      /user/i.test(JSON.stringify(data))
    ) {
      ({ resp, data } = await place(userIds[1]));
    }
    if (!resp.ok) {
      return {
        provider: "myoperator",
        status: "failed",
        note: `MyOperator returned HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`,
      };
    }
    const statusText = String(data?.status ?? "").toLowerCase();
    if (statusText && !statusText.includes("success") && statusText !== "ok") {
      return {
        provider: "myoperator",
        status: "failed",
        note: `MyOperator: ${data?.message || data?.details || statusText}`,
      };
    }
    const callId =
      data?.call_id || data?.callid || data?.unique_id || data?.id || undefined;
    return { provider: "myoperator", callId: callId ? String(callId) : undefined, status: "placed" };
  } catch (err: any) {
    return {
      provider: "myoperator",
      status: "failed",
      note: err?.message || "MyOperator request failed",
    };
  }
};

/* ────────────── Webhook normalisation ────────────── */

/** First value present among several candidate keys, searched case-insensitively. */
const pick = (o: any, keys: string[]): any => {
  if (!o || typeof o !== "object") return undefined;
  const lower: Record<string, any> = {};
  for (const k of Object.keys(o)) lower[k.toLowerCase()] = o[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

const toDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  // Providers send epoch seconds, epoch millis, or a formatted string.
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const toSeconds = (v: any): number => {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return Math.max(0, Math.round(v));
  const s = String(v).trim();
  // "00:01:23" style durations.
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(":").map(Number);
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  }
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

const STATUS_MAP: Record<string, CallStatus> = {
  answered: "answered",
  answer: "answered",
  completed: "completed",
  complete: "completed",
  success: "completed",
  missed: "missed",
  miss: "missed",
  noanswer: "no_answer",
  "no-answer": "no_answer",
  no_answer: "no_answer",
  busy: "busy",
  failed: "failed",
  fail: "failed",
  cancel: "cancelled",
  cancelled: "cancelled",
  ringing: "ringing",
  ring: "ringing",
  initiated: "initiated",
};

export interface NormalizedCall {
  providerCallId?: string;
  refId?: string;
  direction: CallDirection;
  /** Absent for events that say nothing about the call's state (recordings). */
  status?: CallStatus;
  /** MyOperator event type (new event-style webhooks), e.g. "call.answered". */
  eventType?: string;
  customerNumber: string;
  agentNumber?: string;
  didNumber?: string;
  ivrFlow?: string;
  ivrInput?: string;
  agentName?: string;
  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSeconds: number;
  ringSeconds: number;
  recordingUrl?: string;
  /** MyOperator recording file name; resolve with `recordingLink()`. */
  recordingFile?: string;
}

/* ────────────── Recordings ────────────── */

const RECORDING_URL = "https://developers.myoperator.co/recordings/link";
const RECORDING_TTL_MS = 15 * 60 * 1000;
const recordingCache = new Map<string, { at: number; url: string }>();

/**
 * Turn a recording file name from a webhook into a playable link.
 *
 * MyOperator hands out signed S3 URLs that expire, so these are resolved when
 * the call log is read rather than stored, and cached briefly so paging
 * through the log doesn't re-ask for every row.
 */
export const recordingLink = async (file: string): Promise<string | undefined> => {
  const token = config.ivr.myOperatorAuthToken;
  if (!file || !token) return undefined;
  const hit = recordingCache.get(file);
  if (hit && Date.now() - hit.at < RECORDING_TTL_MS) return hit.url;
  try {
    const fetchFn: any = (globalThis as any).fetch;
    const resp = await fetchFn(
      `${RECORDING_URL}?token=${encodeURIComponent(token)}&file=${encodeURIComponent(file)}`,
    );
    const data: any = await resp.json().catch(() => ({}));
    const url = typeof data?.url === "string" ? data.url : undefined;
    if (url) recordingCache.set(file, { at: Date.now(), url });
    return url;
  } catch {
    return undefined;
  }
};

/**
 * Map a MyOperator webhook body onto our call shape.
 *
 * MyOperator's payload keys differ between account types and between the
 * call-status and recording callbacks, and their docs do not pin them down —
 * so every field is looked up across the plausible names rather than assuming
 * one. Anything unrecognised still lands in `rawPayloads` on the log, so a
 * call is never dropped just because a key was named unexpectedly.
 */
/**
 * Flatten nested objects so fields buried in MyOperator's `payload` (e.g.
 * payload.user.contact_number) can be looked up by their leaf name. Shallower
 * keys win, so a top-level field is never shadowed by a nested one.
 */
const flatten = (obj: any, depth = 0, out: Record<string, any> = {}): Record<string, any> => {
  if (!obj || typeof obj !== "object" || depth > 4) return out;
  const nested: [string, any][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) nested.push([k, v]);
    else if (!(k in out)) out[k] = v;
  }
  for (const [k, v] of nested) {
    // Also expose "<parent>_<leaf>" so e.g. user.name → user_name.
    for (const [ck, cv] of Object.entries(v)) {
      if (cv === null || typeof cv !== "object") {
        const key = `${k}_${ck}`;
        if (!(key in out)) out[key] = cv;
      }
    }
    flatten(v, depth + 1, out);
  }
  return out;
};

/** MyOperator event-style webhook `event_type` → our status. */
const EVENT_STATUS: [RegExp, CallStatus | undefined][] = [
  [/recording/, undefined],
  [/missed/, "missed"],
  [/no_?answer|unanswered/, "no_answer"],
  [/busy/, "busy"],
  [/fail|error|reject/, "failed"],
  [/cancel/, "cancelled"],
  [/answer|bridge|connected/, "answered"],
  [/end|complete|hangup|disconnect|terminat/, "completed"],
  [/ring|dial|alert/, "ringing"],
  [/initiat|start|creat/, "initiated"],
];

const str = (v: any): string | undefined =>
  v === undefined || v === null || v === "" ? undefined : String(v);

/**
 * MyOperator reports each side of a call as a "leg": leg 1 is the agent,
 * leg 2 the customer. The agent's number, name and ring/talk time all live
 * there, so the legs are read separately from the flat fields.
 */
const legInfo = (body: any) => {
  const legs: any[] = Array.isArray(body?.payload?.legs) ? body.payload.legs : [];
  const agent = legs.find((l) => String(l?.type) === "agent");
  const customer = legs.find((l) => String(l?.type) === "customer");
  return {
    agentNumber: agent ? tenDigits(String(agent.phone_number || "")) || undefined : undefined,
    agentName: str(agent?.agent?.name),
    answeredAt: toDate(agent?.answered_at),
    // What the panel shows as "ring" is how long the customer's phone rang.
    ringSeconds: toSeconds((customer || agent)?.ring_duration),
  };
};

/**
 * Map a MyOperator webhook body onto our call shape.
 *
 * MyOperator sends two shapes: the older flat after-call webhook, and the
 * newer event stream (`event_type`: call.initiated → call.dial_begin →
 * call.answered → … with the details nested under `payload`, one
 * `session_id` per call). Field names are looked up across the plausible
 * spellings rather than assuming one, and anything unrecognised still lands
 * in `rawPayloads` on the log, so a call is never dropped for a naming quirk.
 */
export const normalizeWebhook = (body: any): NormalizedCall | null => {
  if (!body || typeof body !== "object") return null;
  const p = flatten(body);
  const eventType = str(p.event_type)?.toLowerCase();

  const leg = legInfo(body);

  const customerRaw = pick(p, [
    "customer_identifier", "caller_number", "callerNumber", "customer_number",
    "customer_contact_number", "from", "from_number", "source", "src",
    "number_2", "customer", "mobile",
  ]);
  const agentRaw = pick(p, [
    "agent_number", "agentNumber", "user_contact_number", "user_number",
    "answered_agent_number", "agent_contact_number", "receiver_number",
    "to", "to_number", "destination", "dst", "number",
  ]);
  const didRaw = pick(p, [
    "system_identifier", "did", "did_number", "didNumber", "virtual_number", "company_number",
  ]);

  const customerNumber = tenDigits(String(customerRaw ?? ""));
  if (!customerNumber) return null; // nothing identifiable to log

  let status: CallStatus | undefined;
  if (eventType) {
    status = EVENT_STATUS.find(([re]) => re.test(eventType))?.[1];
    // A generic "ended" event may still carry the real outcome.
    const outcome = String(pick(p, ["call_status", "status", "disposition", "hangup_reason"]) ?? "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (status === "completed" && STATUS_MAP[outcome] && STATUS_MAP[outcome] !== "answered") {
      status = STATUS_MAP[outcome];
    }
  } else {
    const rawStatus = String(
      pick(p, ["status", "call_status", "callStatus", "state", "disposition"]) ?? "",
    )
      .toLowerCase()
      .replace(/\s+/g, "");
    status = STATUS_MAP[rawStatus] || "completed";
  }

  const rawDirection = String(
    pick(p, ["direction", "call_type", "callType", "type"]) ?? "",
  ).toLowerCase();
  const direction: CallDirection = rawDirection.includes("click")
    ? "click_to_call"
    : rawDirection.includes("out")
      ? "outbound"
      : "inbound";

  const duration = toSeconds(
    pick(p, [
      "duration", "call_duration", "answered_duration", "talk_time", "talk_duration",
      "conversation_duration", "billsec", "bill_duration",
    ]),
  );
  const ring = toSeconds(pick(p, ["ring_duration", "ringing_duration", "wait_time"]));

  const at = toDate(pick(p, ["timestamp"]));
  const recording = str(
    pick(p, [
      "recording_url", "recordingUrl", "recording", "record_url", "recording_file",
      "recording_link", "audio_url", "voice_url", "call_recording", "file_url",
    ]),
  );

  return {
    // session_id ties every event of one call together.
    providerCallId: str(pick(p, ["session_id", "call_id", "callId", "unique_id", "uniqueid", "uuid", "id"])),
    // client_ref_id is OUR reference (the one passed to clickToCall);
    // ref_id is MyOperator's own and must not be mistaken for it.
    refId: str(pick(p, ["client_ref_id", "reference_id", "referenceId", "refid", "ref_id"])),
    direction,
    status,
    eventType,
    customerNumber,
    agentNumber: leg.agentNumber || (agentRaw ? tenDigits(String(agentRaw)) || undefined : undefined),
    didNumber: str(didRaw),
    ivrFlow: str(pick(p, ["ivr_flow", "ivr_name", "ivr", "department", "department_name", "queue", "group_name"])),
    ivrInput: str(pick(p, ["ivr_input", "dtmf", "key_pressed", "input", "digits"])),
    agentName: leg.agentName || str(pick(p, ["agent_name", "agentName", "answered_agent_name", "user_name"])),
    startedAt:
      toDate(pick(p, ["start_time", "startTime", "call_time", "initiated_at", "date"])) ||
      (status === "initiated" ? at : undefined),
    answeredAt:
      leg.answeredAt ||
      toDate(pick(p, ["answer_time", "answered_at", "answerTime"])) ||
      (status === "answered" ? at : undefined),
    endedAt:
      toDate(pick(p, ["end_time", "endTime", "hangup_time", "completed_at", "ended_at"])) ||
      (eventType && status && !["initiated", "ringing", "answered"].includes(status) ? at : undefined),
    durationSeconds: duration,
    ringSeconds: ring || leg.ringSeconds,
    recordingFile: str(pick(p, ["recording_filename", "recording_file", "recording_name"])),
    // Only a real link — a bare "1"/"true" recording flag is not a URL.
    recordingUrl: recording && /^https?:\/\//i.test(recording) ? recording : undefined,
  };
};

export default { clickToCall, normalizeWebhook, isConfigured, tenDigits };
