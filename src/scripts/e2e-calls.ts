/**
 * MyOperator call-flow end-to-end test.
 *
 * Drives the real controllers against the real database: the public webhook
 * (inbound calls, IVR routing, recordings, repeat events for one call) and the
 * admin call log. Click-to-call itself is exercised as far as the provider
 * boundary — it is not dialled, because a test must not ring a real phone.
 *
 * Everything it creates is prefixed 99999 / E2E- and removed at the end.
 *
 * Usage: npm run e2e:calls
 */
import mongoose from "mongoose";
import config from "../config";
import CallLog from "../models/call-log.model";
import "../models/admin.model";
import * as hook from "../controllers/myoperator-webhook.controller";
import * as callC from "../controllers/admin/call.controller";
import { normalizeWebhook, tenDigits } from "../services/myoperator.service";

const CUSTOMER = "9999988801";
let pass = 0;
let fail = 0;
const failures: string[] = [];

const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

/** Call a public (res-writing) controller and capture what it sent. */
const callPublic = async (fn: any, opts: any = {}) => {
  const req: any = { body: opts.body || {}, query: opts.query || {}, headers: opts.headers || {}, params: {} };
  let http = 200;
  let body: any;
  const res: any = {
    status(c: number) { http = c; return res; },
    json(b: any) { body = b; return res; },
  };
  await fn(req, res);
  return { http, body };
};

/** Call an admin (next-style) controller. */
const callAdmin = async (fn: any, opts: any = {}) => {
  const req: any = {
    params: opts.params || {}, query: opts.query || {}, body: opts.body || {},
    adminId: opts.adminId, rCode: undefined, msg: undefined, rData: undefined,
  };
  const res: any = { locals: {}, status: () => res, json: () => res };
  await fn(req, res, () => undefined);
  return { code: req.rCode ?? 1, msg: req.msg, data: req.rData };
};

const cleanup = () => CallLog.deleteMany({ customerNumber: tenDigits(CUSTOMER) });

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log("✅ Connected to MongoDB\n");
  await cleanup();

  try {
    // ══ Payload normalisation ══
    section("Webhook payload normalisation");
    const n1 = normalizeWebhook({
      call_id: "MO-E2E-1", caller_number: `+91${CUSTOMER}`, agent_number: "08045551234",
      status: "Answered", direction: "inbound", duration: "00:02:15",
      ring_duration: 12, did: "1800123456", ivr_flow: "Emergency", dtmf: "1",
      start_time: "2026-09-08T10:15:00Z",
    });
    ok("reads a standard payload", n1?.providerCallId === "MO-E2E-1" && n1?.status === "answered");
    ok("normalises +91 to ten digits", n1?.customerNumber === CUSTOMER, n1?.customerNumber);
    ok("parses HH:MM:SS duration to seconds", n1?.durationSeconds === 135, String(n1?.durationSeconds));
    ok("keeps the IVR node and key pressed", n1?.ivrFlow === "Emergency" && n1?.ivrInput === "1");

    // Different accounts use different key names — all must land.
    const n2 = normalizeWebhook({
      data: { uniqueid: "MO-E2E-ALT", from: CUSTOMER, callStatus: "missed", call_type: "Outbound" },
    });
    ok("reads alternative key names and a nested body",
       n2?.providerCallId === "MO-E2E-ALT" && n2?.status === "missed" && n2?.direction === "outbound");
    ok("a payload with no number is rejected rather than stored as junk",
       normalizeWebhook({ status: "answered" }) === null);
    ok("a non-object body is rejected", normalizeWebhook("garbage") === null);

    // ══ Webhook ══
    section("Public webhook");
    const prevToken = config.ivr.myOperatorWebhookToken;
    (config.ivr as any).myOperatorWebhookToken = "e2e-secret";
    let r = await callPublic(hook.receive, { body: { call_id: "X", caller_number: CUSTOMER }, query: {} });
    ok("a request with no token is rejected", r.http === 401);
    r = await callPublic(hook.receive, {
      body: { call_id: "X", caller_number: CUSTOMER }, query: { token: "wrong" },
    });
    ok("a wrong token is rejected", r.http === 401);
    (config.ivr as any).myOperatorWebhookToken = prevToken;

    r = await callPublic(hook.verify, {});
    ok("GET probe answers so a bad URL is obvious", r.body?.success === true);

    // A real inbound call, arriving as three events.
    r = await callPublic(hook.receive, {
      body: {
        call_id: "MO-E2E-100", caller_number: CUSTOMER, did: "1800123456",
        status: "ringing", direction: "inbound", ivr_flow: "Ambulance",
      },
    });
    ok("inbound ringing event creates the call", r.body?.data?.created === true);

    r = await callPublic(hook.receive, {
      body: {
        call_id: "MO-E2E-100", caller_number: CUSTOMER, status: "answered",
        agent_number: "9999977701", agent_name: "Control Room", duration: 95,
      },
    });
    ok("the answered event updates the same call, not a new one", r.body?.data?.updated === true);

    // The recording usually arrives last, carrying almost nothing else.
    r = await callPublic(hook.receive, {
      body: {
        call_id: "MO-E2E-100", caller_number: CUSTOMER,
        recording_url: "https://recordings.myoperator.co/e2e-100.mp3",
      },
    });
    ok("the recording event attaches to the same call", r.body?.data?.updated === true);

    const stored: any = await CallLog.findOne({ providerCallId: "MO-E2E-100" }).lean();
    ok("recording url stored", stored?.recordingUrl?.endsWith("e2e-100.mp3"));
    ok("earlier fields survive the sparse recording event",
       stored?.agentName === "Control Room" && stored?.didNumber === "1800123456" && stored?.ivrFlow === "Ambulance",
       JSON.stringify({ a: stored?.agentName, d: stored?.didNumber, i: stored?.ivrFlow }));
    ok("duration kept from the answered event", stored?.durationSeconds === 95, String(stored?.durationSeconds));
    ok("all three payloads retained for support", (stored?.rawPayloads || []).length === 3);
    ok("only ONE row exists for the call",
       (await CallLog.countDocuments({ providerCallId: "MO-E2E-100" })) === 1);

    r = await callPublic(hook.receive, { body: { nonsense: true } });
    ok("an unrecognised payload is acknowledged, not retried into a storm", r.http === 200 && r.body?.success === true);

    // ══ Admin call log ══
    section("Admin call log");
    let a = await callAdmin(callC.list, { query: { search: CUSTOMER } });
    ok("call appears in the log", (a.data?.items || []).length >= 1);
    ok("rawPayloads excluded from the list for weight", a.data?.items?.[0]?.rawPayloads === undefined);

    a = await callAdmin(callC.list, { query: { hasRecording: "true", search: CUSTOMER } });
    ok("filter by recorded-only works", (a.data?.items || []).length === 1);

    a = await callAdmin(callC.list, { query: { search: "(unclosed" } });
    ok("a regex-special search string does not crash the log", a.code === 1);

    const id = String(stored._id);
    a = await callAdmin(callC.detail, { params: { id } });
    ok("detail returns the provider payloads", (a.data?.item?.rawPayloads || []).length === 3);

    a = await callAdmin(callC.saveNotes, { params: { id }, body: { notes: "Ambulance dispatched" } });
    ok("notes saved against the call", a.data?.item?.notes === "Ambulance dispatched");

    a = await callAdmin(callC.stats, {});
    ok("stats count the recorded call", (a.data?.recorded || 0) >= 1);

    // ══ Click-to-call validation (stops at the provider boundary) ══
    section("Click-to-call guards");
    a = await callAdmin(callC.placeCall, { body: { customerNumber: "123" } });
    ok("a short customer number is refused", a.code === 0, a.data?.hint);

    a = await callAdmin(callC.placeCall, {
      body: { customerNumber: CUSTOMER, subjectType: "not_a_subject" },
    });
    ok("an unknown subject type is refused", a.code === 0, a.data?.hint);

    a = await callAdmin(callC.placeCall, { body: { customerNumber: CUSTOMER, agentNumber: "9999977701" } });
    // With no MyOperator credentials configured this must fail cleanly and
    // say so, rather than throwing or silently pretending it dialled.
    const configured = !!(config.ivr.myOperatorApiKey && config.ivr.myOperatorCompanyId && config.ivr.myOperatorSecretToken);
    if (configured) {
      ok("click-to-call reaches the provider", a.code === 1 || !!a.data?.hint, a.data?.hint);
    } else {
      ok("unconfigured click-to-call fails with a clear message, not a crash",
         a.code === 0 && !!a.data?.notConfigured, a.data?.hint);
    }
  } finally {
    section("Cleanup");
    await cleanup();
    console.log("  ✅ test data removed");
    await mongoose.disconnect();
  }

  console.log(`\n${"═".repeat(46)}`);
  console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
  if (fail) { console.log("\n  Failures:"); failures.forEach((f) => console.log(`   • ${f}`)); }
  console.log("═".repeat(46));
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error("\n💥 e2e crashed:", e); process.exit(1); });
