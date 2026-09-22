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
 * Click-to-call: MyOperator rings `agentNumber` first and, when the agent
 * picks up, bridges them to `customerNumber`.
 *
 * That order matters — the agent is already at their desk, so ringing them
 * first means the patient's phone only rings when a human is genuinely on the
 * line, instead of the patient answering to silence.
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
  if (agent.length !== 10) {
    return { provider: "myoperator", status: "failed", note: "invalid agent number" };
  }
  if (customer.length !== 10) {
    return { provider: "myoperator", status: "failed", note: "invalid customer number" };
  }

  try {
    const fetchFn: any = (globalThis as any).fetch;
    if (!fetchFn) {
      return { provider: "myoperator", status: "failed", note: "fetch unavailable" };
    }
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
        // E.164, as in MyOperator's own examples ("+919876543210").
        number: `+91${agent}`,
        number_2: `+91${customer}`,
        reference_id: refId,
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
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
        note: `MyOperator: ${data?.message || statusText}`,
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
  status: CallStatus;
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
}

/**
 * Map a MyOperator webhook body onto our call shape.
 *
 * MyOperator's payload keys differ between account types and between the
 * call-status and recording callbacks, and their docs do not pin them down —
 * so every field is looked up across the plausible names rather than assuming
 * one. Anything unrecognised still lands in `rawPayloads` on the log, so a
 * call is never dropped just because a key was named unexpectedly.
 */
export const normalizeWebhook = (body: any): NormalizedCall | null => {
  if (!body || typeof body !== "object") return null;
  // Some providers nest the useful part.
  const p = body.data && typeof body.data === "object" ? { ...body, ...body.data } : body;

  const customerRaw = pick(p, [
    "caller_number", "callerNumber", "customer_number", "from", "from_number",
    "source", "src", "number_2", "customer", "mobile",
  ]);
  const agentRaw = pick(p, [
    "agent_number", "agentNumber", "to", "to_number", "destination",
    "dst", "number", "answered_agent_number",
  ]);
  const didRaw = pick(p, ["did", "did_number", "didNumber", "virtual_number", "company_number"]);

  const customerNumber = tenDigits(String(customerRaw ?? ""));
  if (!customerNumber) return null; // nothing identifiable to log

  const rawStatus = String(
    pick(p, ["status", "call_status", "callStatus", "state", "disposition"]) ?? "",
  )
    .toLowerCase()
    .replace(/\s+/g, "");
  const status: CallStatus = STATUS_MAP[rawStatus] || "completed";

  const rawDirection = String(
    pick(p, ["direction", "call_type", "callType", "type"]) ?? "",
  ).toLowerCase();
  const direction: CallDirection = rawDirection.includes("out")
    ? "outbound"
    : rawDirection.includes("click")
      ? "click_to_call"
      : "inbound";

  const duration = toSeconds(
    pick(p, ["duration", "call_duration", "answered_duration", "talk_time", "conversation_duration"]),
  );
  const ring = toSeconds(pick(p, ["ring_duration", "ringing_duration", "wait_time"]));

  return {
    providerCallId: (() => {
      const v = pick(p, ["call_id", "callId", "unique_id", "uniqueid", "uuid", "id"]);
      return v === undefined ? undefined : String(v);
    })(),
    refId: (() => {
      const v = pick(p, ["reference_id", "referenceId", "refid", "ref_id"]);
      return v === undefined ? undefined : String(v);
    })(),
    direction,
    status,
    customerNumber,
    agentNumber: agentRaw ? tenDigits(String(agentRaw)) : undefined,
    didNumber: didRaw ? String(didRaw) : undefined,
    ivrFlow: (() => {
      const v = pick(p, ["ivr_flow", "ivr", "department", "queue", "group_name"]);
      return v === undefined ? undefined : String(v);
    })(),
    ivrInput: (() => {
      const v = pick(p, ["ivr_input", "dtmf", "key_pressed", "input"]);
      return v === undefined ? undefined : String(v);
    })(),
    agentName: (() => {
      const v = pick(p, ["agent_name", "agentName", "answered_agent_name", "user_name"]);
      return v === undefined ? undefined : String(v);
    })(),
    startedAt: toDate(pick(p, ["start_time", "startTime", "call_time", "initiated_at", "date"])),
    answeredAt: toDate(pick(p, ["answer_time", "answered_at", "answerTime"])),
    endedAt: toDate(pick(p, ["end_time", "endTime", "hangup_time", "completed_at"])),
    durationSeconds: duration,
    ringSeconds: ring,
    recordingUrl: (() => {
      const v = pick(p, [
        "recording_url", "recordingUrl", "recording", "record_url",
        "audio_url", "voice_url", "call_recording", "recording_link",
      ]);
      return v === undefined ? undefined : String(v);
    })(),
  };
};

export default { clickToCall, normalizeWebhook, isConfigured, tenDigits };
