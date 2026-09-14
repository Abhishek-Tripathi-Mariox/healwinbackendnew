/**
 * Replace the broken unique indexes on `attendances`.
 *
 * The old pair were `sparse` on compound keys, which does not do what it looks
 * like: it only skips a document missing EVERY indexed field, and `date` is
 * always set. So every hr_employee row was indexed as
 * `{ ambulanceStaffId: null, date }` and the second employee marked on a given
 * day was rejected — attendance simply could not be recorded for more than one
 * person per day.
 *
 * `createIndexes` cannot fix this on its own: an index with the same key but
 * different options is a conflict, not an update. The old ones have to be
 * dropped first.
 *
 * Safe to re-run. Reports any duplicate rows that would block the rebuild.
 *
 * Usage: npm run migrate:attendance-indexes
 */
import mongoose from "mongoose";
import config from "../config";
import Attendance from "../models/attendance.model";

const WANTED = [
  {
    name: "employeeId_1_date_1",
    key: { employeeId: 1, date: 1 },
    partial: { employeeId: { $type: "objectId" } },
  },
  {
    name: "ambulanceStaffId_1_date_1",
    key: { ambulanceStaffId: 1, date: 1 },
    partial: { ambulanceStaffId: { $type: "objectId" } },
  },
];

const run = async () => {
  await mongoose.connect(config.database.url);
  const col = Attendance.collection;

  // A genuine duplicate would stop the unique index being rebuilt; better to
  // name the rows than to fail with a raw driver error.
  for (const w of WANTED) {
    const field = Object.keys(w.key)[0];
    const dupes = await col
      .aggregate([
        { $match: { [field]: { $type: "objectId" } } },
        { $group: { _id: { s: `$${field}`, d: "$date" }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $limit: 20 },
      ])
      .toArray();
    if (dupes.length) {
      console.error(`\n❌ ${field}: ${dupes.length} duplicate (person, date) pair(s) must be resolved first:`);
      dupes.forEach((d: any) =>
        console.error(`   • ${d._id.s} on ${new Date(d._id.d).toISOString().slice(0, 10)} (${d.n} rows)`),
      );
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  const existing = await col.indexes();
  for (const w of WANTED) {
    const found = existing.find((i: any) => i.name === w.name);
    const alreadyRight =
      found &&
      found.unique &&
      JSON.stringify(found.partialFilterExpression || null) === JSON.stringify(w.partial);
    if (alreadyRight) {
      console.log(`  ⏭  ${w.name} already correct`);
      continue;
    }
    if (found) {
      await col.dropIndex(w.name);
      console.log(`  − dropped ${w.name} (sparse=${!!found.sparse})`);
    }
    await col.createIndex(w.key as any, {
      name: w.name,
      unique: true,
      partialFilterExpression: w.partial,
    });
    console.log(`  + created ${w.name} (partial)`);
  }

  await mongoose.disconnect();
  console.log("\n✅ attendance indexes rebuilt\n");
  process.exit(0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
