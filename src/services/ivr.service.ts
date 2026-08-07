import config from "../config";

/**
 * IVR provider adapter. Places an automated voice call to `toPhone`.
 *
 * Pluggable by `config.ivr.provider`:
 *   • "exotel" — places a real call via Exotel's Call/connect API (when SID +
 *     API key/token + caller-id are configured).
 *   • "mcube" — click-to-call bridge: dials the operator/control-room number
 *     first, and on answer connects them to `toPhone` (when an API key +
 *     operator number are configured).
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
  context?: { reason?: string; escalationId?: string; refId?: string },
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

/**
 * MCube click-to-call: dials `exenumber` (the operator/control-room number)
 * first; when they pick up, MCube bridges the call to `custnumber` (the
 * escalation contact). Best-effort: any error degrades to a failed result.
 */
const placeViaMcube = async (
  toPhone: string,
  context?: { escalationId?: string; refId?: string },
): Promise<PlaceCallResult> => {
  const { mcubeApiUrl, mcubeApiKey, operatorNumber } = config.ivr;

  if (!mcubeApiKey || !operatorNumber) {
    return {
      provider: "mcube",
      status: "failed",
      note: "mcube not fully configured (need MCUBE_API_KEY + IVR_OPERATOR_NUMBER)",
    };
  }

  const exenumber = operatorNumber.replace(/\D/g, "").slice(-10);
  const custnumber = toPhone.replace(/\D/g, "").slice(-10);

  try {
    const fetchFn: any = (globalThis as any).fetch;
    if (!fetchFn) {
      return { provider: "mcube", status: "failed", note: "fetch unavailable" };
    }
    const resp = await fetchFn(mcubeApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        HTTP_AUTHORIZATION: mcubeApiKey,
        exenumber,
        custnumber,
        refurl: "1",
        refid: context?.refId || context?.escalationId || "",
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    const isSuccess =
      typeof data === "string"
        ? data.toLowerCase().includes("succ")
        : String(data?.status || data?.message || "").toLowerCase().includes("succ");
    if (!isSuccess) {
      return { provider: "mcube", status: "failed", note: `mcube: ${JSON.stringify(data).slice(0, 200)}` };
    }
    const callId = data?.call_id || data?.id || data?.refid;
    return { provider: "mcube", callId, status: "placed" };
  } catch (err: any) {
    return {
      provider: "mcube",
      status: "failed",
      note: err?.message || "mcube call error",
    };
  }
};

/**
 * MyOperator OBD (outbound dialer) API — click-to-call bridge: dials the
 * operator/control-room number first, and on pickup bridges to the
 * escalation contact. Best-effort: any error degrades to a failed result.
 *
 * Confirmed against MyOperator's public "OBD APIs" guide (obd-api-v1,
 * x-api-key header, company_id/secret_token/type/number/number_2 body) — but
 * the exact `type` value for a live peer-to-peer bridge (vs. an IVR-flow
 * campaign call) isn't published, so it's configurable via
 * MYOPERATOR_CALL_TYPE. Check the account's dashboard (Manage → API
 * integration) if calls don't bridge as expected.
 */
const placeViaMyOperator = async (
  toPhone: string,
  context?: { escalationId?: string; refId?: string },
): Promise<PlaceCallResult> => {
  const {
    myOperatorApiUrl,
    myOperatorApiKey,
    myOperatorCompanyId,
    myOperatorSecretToken,
    myOperatorCallType,
    operatorNumber,
  } = config.ivr;

  if (!myOperatorApiKey || !myOperatorCompanyId || !myOperatorSecretToken || !operatorNumber) {
    return {
      provider: "myoperator",
      status: "failed",
      note:
        "myoperator not fully configured (need MYOPERATOR_API_KEY + MYOPERATOR_COMPANY_ID + " +
        "MYOPERATOR_SECRET_TOKEN + IVR_OPERATOR_NUMBER)",
    };
  }

  const number = operatorNumber.replace(/\D/g, "").slice(-10);
  const number2 = toPhone.replace(/\D/g, "").slice(-10);

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
        number,
        number_2: number2,
        reference_id: context?.refId || context?.escalationId || "",
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    const statusText = String(data?.status || data?.message || "").toLowerCase();
    const isSuccess = resp.ok && (statusText === "" || statusText.includes("success"));
    if (!isSuccess) {
      return { provider: "myoperator", status: "failed", note: `myoperator: ${JSON.stringify(data).slice(0, 200)}` };
    }
    const callId = data?.call_id || data?.callid || data?.id || data?.reference_id;
    return { provider: "myoperator", callId, status: "placed" };
  } catch (err: any) {
    return {
      provider: "myoperator",
      status: "failed",
      note: err?.message || "myoperator call error",
    };
  }
};

export const placeCall = async (
  toPhone: string,
  context?: { reason?: string; escalationId?: string; refId?: string },
): Promise<PlaceCallResult> => {
  if (config.ivr.provider === "exotel") {
    return placeViaExotel(toPhone, context);
  }
  if (config.ivr.provider === "mcube") {
    return placeViaMcube(toPhone, context);
  }
  if (config.ivr.provider === "myoperator") {
    return placeViaMyOperator(toPhone, context);
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
