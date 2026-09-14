/**
 * Each call tab must show exactly its own kind, its counts must match what the
 * list returns, and the tabs together must account for every call with no
 * double-counting.
 *
 * Usage: npm run verify:call-tabs
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import CallLog from "../models/call-log.model";
import { list, stats, KIND_FILTERS } from "../controllers/admin/call.controller";
import { PERMISSIONS } from "../models/role.model";

const TAG = "VERIFY-CALLS";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};

const call = async (fn: any, query: any = {}) => {
  const req: any = { query, admin: { permissions: [PERMISSIONS.CALLS_VIEW] } };
  await fn(req, {} as any, (() => undefined) as any);
  return req.rData;
};

const cleanup = () => CallLog.deleteMany({ subjectLabel: new RegExp(`^${TAG}`) });

const run = async () => {
  await mongoose.connect(config.database.url);
  await cleanup();

  const mk = (over: any) =>
    CallLog.create({
      provider: "myoperator",
      customerNumber: "9876500011",
      subjectLabel: `${TAG} ${over._tag}`,
      status: "completed",
      ...over,
    });

  // Two IVR calls (one with a recording), two click-to-call (one recorded),
  // one plain inbound, one outbound.
  await mk({ _tag: "ivr-1", direction: "inbound", ivrFlow: "Emergency", ivrInput: "1", recordingUrl: "https://x/1.mp3" });
  await mk({ _tag: "ivr-2", direction: "inbound", ivrFlow: "Billing" });
  await mk({ _tag: "ctc-1", direction: "click_to_call", agentNumber: "9000000001", recordingUrl: "https://x/2.mp3", placedByAdminId: new Types.ObjectId() });
  await mk({ _tag: "ctc-2", direction: "click_to_call", agentNumber: "9000000002" });
  await mk({ _tag: "in-1", direction: "inbound" });
  await mk({ _tag: "out-1", direction: "outbound" });

  const mine = { subjectLabel: new RegExp(`^${TAG}`) };
  const countOf = (kind: string, extra: any = {}) =>
    CallLog.countDocuments({ $and: [mine, KIND_FILTERS[kind], extra] });

  console.log("\n── Each tab shows only its own kind ──");
  ok("IVR tab finds both IVR calls", (await countOf("ivr")) === 2, String(await countOf("ivr")));
  ok("click-to-call tab finds both", (await countOf("click_to_call")) === 2, String(await countOf("click_to_call")));
  ok("direct inbound excludes IVR calls", (await countOf("inbound")) === 1, String(await countOf("inbound")));

  console.log("\n── No overlap, nothing lost ──");
  const ivrIds = (await CallLog.find({ $and: [mine, KIND_FILTERS.ivr] }).select("_id").lean()).map((r: any) => String(r._id));
  const ctcIds = (await CallLog.find({ $and: [mine, KIND_FILTERS.click_to_call] }).select("_id").lean()).map((r: any) => String(r._id));
  const inIds = (await CallLog.find({ $and: [mine, KIND_FILTERS.inbound] }).select("_id").lean()).map((r: any) => String(r._id));
  const union = new Set([...ivrIds, ...ctcIds, ...inIds]);
  ok("a call never appears in two tabs", union.size === ivrIds.length + ctcIds.length + inIds.length);
  // The outbound call belongs to none of the three — that is correct, and is
  // why "All calls" exists.
  ok("the three tabs cover 5 of the 6 (outbound lives only under All)", union.size === 5, String(union.size));

  console.log("\n── Recording counts per tab ──");
  const rec = { recordingUrl: { $exists: true, $nin: ["", null] } };
  ok("IVR has one recording", (await countOf("ivr", rec)) === 1);
  ok("click-to-call has one recording", (await countOf("click_to_call", rec)) === 1);

  console.log("\n── The list endpoint honours the tab ──");
  const ivrList = await call(list, { kind: "ivr", limit: 100, search: TAG });
  ok("list(kind=ivr) returns only IVR calls",
    (ivrList.items || []).every((i: any) => i.ivrFlow || i.ivrInput),
    JSON.stringify((ivrList.items || []).map((i: any) => i.subjectLabel)));

  // kind + search must BOTH apply — each needs its own $or, and assigning
  // query.$or twice would silently drop the first.
  const both = await call(list, { kind: "click_to_call", search: "9000000001", limit: 100 });
  ok("tab and search combine instead of overwriting",
    (both.items || []).length === 1 &&
      both.items[0].subjectLabel === `${TAG} ctc-1`,
    JSON.stringify((both.items || []).map((i: any) => i.subjectLabel)));

  console.log("\n── Stats expose per-tab totals ──");
  const s = await call(stats);
  ok("stats report every tab", !!s.byKind?.ivr && !!s.byKind?.click_to_call && !!s.byKind?.inbound);
  ok("IVR stat is at least the seeded two", (s.byKind?.ivr?.calls ?? 0) >= 2, String(s.byKind?.ivr?.calls));
  ok("stat counts agree with the list",
    (await call(list, { kind: "ivr", limit: 1 })).pagination.total === s.byKind.ivr.calls);

  await cleanup();
  await mongoose.disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
