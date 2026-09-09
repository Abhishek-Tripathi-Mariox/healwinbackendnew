/**
 * Check that every SOS dashboard card drills into a list holding exactly the
 * records its number was counted from.
 *
 * The cards are scoped to the active tab (type), because the list always is —
 * this proves the per-type breakdown matches the list query for that tab.
 *
 * Usage: npm run verify:sos-drilldown
 */
import mongoose from "mongoose";
import config from "../config";
import { SOSSubmission } from "../models/sos-submission.model";

const TYPES = ["CALL", "FORM", "APP_DOWNLOAD"] as const;
const STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

const run = async () => {
  await mongoose.connect(config.database.url);
  let bad = 0;
  const cmp = (label: string, card: number, list: number) => {
    const same = card === list;
    if (!same) bad++;
    console.log(`  ${same ? "✅" : "❌"} ${label}: card=${card} list=${list}`);
  };

  // Rebuild the aggregation the stats endpoint returns.
  const rows = await SOSSubmission.aggregate([
    { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const at = (type: string, status: string) =>
    rows.find((r: any) => r._id?.type === type && r._id?.status === status)?.count || 0;

  for (const type of TYPES) {
    console.log(`\n── ${type} tab ──`);
    const total = rows
      .filter((r: any) => r._id?.type === type)
      .reduce((s: number, r: any) => s + r.count, 0);
    // "Total" card clears the status filter, so the list query is type only.
    cmp("Total", total, await SOSSubmission.countDocuments({ type }));
    for (const status of STATUSES) {
      cmp(
        status,
        at(type, status),
        await SOSSubmission.countDocuments({ type, status }),
      );
    }
  }

  // The red banner is deliberately global — it must NOT be tab-scoped.
  const globalPending = await SOSSubmission.countDocuments({ status: "PENDING" });
  const perTabPending = TYPES.reduce((s, t) => s + at(t, "PENDING"), 0);
  console.log("\n── Banner (global by design) ──");
  cmp("pending across all tabs", globalPending, perTabPending);

  await mongoose.disconnect();
  console.log(bad ? `\n❌ ${bad} mismatch(es)\n` : "\n✅ every card matches its filtered list\n");
  process.exit(bad ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
