import config from "../config";

/**
 * IVR provider adapter. Places an automated voice call to `toPhone`.
 *
 * Pluggable by `config.ivr.provider`:
 *   • "exotel" — places a real call via Exotel's Call/connect API (when SID +
 *     API key/token + caller-id are configured).
 *   • "log" (default) — records the intended call without dialling, so the
 *     escalation flow is fully exercised in dev / when telephony isn't wired.
 *
 * Returns a normalized result the escalation journal can store.
 */
export interface PlaceCallResult {
  provider: string;
  callId?: string;
  status: "placed" | "failed";
  note?: string;
}

/**
 * Exotel "connect a call to a number" — dials the agent (the contact) and,
 * on answer, connects them to a flow/applet or the caller-id. We use the
 * simple number-to-number connect form. Best-effort: any error degrades to a
 * failed result rather than throwing, so one bad tier doesn't abort the chain.
 */
const placeViaExotel = async (
  toPhone: string,
): Promise<PlaceCallResult> => {
  const {
    exotelSid,
    exotelApiKey,
    exotelApiToken,
    exotelCallerId,
    exotelSubdomain,
  } = config.ivr;

  if (!exotelSid || !exotelApiKey || !exotelApiToken || !exotelCallerId) {
    return {
      provider: "exotel",
      status: "failed",
      note: "exotel not fully configured",
    };
  }

  const url = `https://${exotelApiKey}:${exotelApiToken}@${exotelSubdomain}/v1/Accounts/${exotelSid}/Calls/connect.json`;
  const body = new URLSearchParams({
    From: toPhone, // the contact we are escalating to
    CallerId: exotelCallerId,
    Url: `http://my.exotel.com/${exotelSid}/exoml/start_voice/${exotelSid}`,
  });

  try {
    const fetchFn: any = (globalThis as any).fetch;
    if (!fetchFn) {
      return { provider: "exotel", status: "failed", note: "fetch unavailable" };
    }
    const resp = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data: any = await resp.json().catch(() => ({}));
    const callId = data?.Call?.Sid as string | undefined;
    if (!resp.ok) {
      return {
        provider: "exotel",
        status: "failed",
        note: `exotel http ${resp.status}`,
      };
    }
    return { provider: "exotel", callId, status: "placed" };
  } catch (err: any) {
    return {
      provider: "exotel",
      status: "failed",
      note: err?.message || "exotel call error",
    };
  }
};

export const placeCall = async (
  toPhone: string,
  context?: { reason?: string; escalationId?: string },
): Promise<PlaceCallResult> => {
  if (config.ivr.provider === "exotel") {
    return placeViaExotel(toPhone);
  }
  // "log" provider — simulate a placed call for the journal.
  const callId = `log-${Date.now()}-${toPhone.slice(-4)}`;
  console.log(
    `[IVR:log] would call ${toPhone}` +
      (context?.reason ? ` (reason: ${context.reason})` : "") +
      (context?.escalationId ? ` [escalation ${context.escalationId}]` : ""),
  );
  return { provider: "log", callId, status: "placed", note: "simulated call" };
};

export default { placeCall };
