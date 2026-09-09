/**
 * Backfill `phoneKey` on existing patient records.
 *
 * New and edited records get it from the model hooks; rows written before the
 * field existed have none, and the portal looks patients up by that key — so
 * without this they simply stop being found. Run once, as part of the deploy
 * that introduces the field.
 *
 * Safe to re-run: only touches rows whose key is missing or stale.
 *
 * Usage: npm run migrate:patient-phonekey
 */
import mongoose from "mongoose";
import config from "../config";
import HospitalPatient, { toPhoneKey } from "../models/hospital-patient.model";

const BATCH = 1000;

const run = async () => {
  await mongoose.connect(config.database.url);

  const total = await HospitalPatient.countDocuments({});
  let scanned = 0;
  let updated = 0;
  let ops: any[] = [];

  const flush = async () => {
    if (!ops.length) return;
    const res = await HospitalPatient.bulkWrite(ops, { ordered: false });
    updated += res.modifiedCount || 0;
    ops = [];
  };

  // Streamed, so a large collection does not have to fit in memory.
  const cursor = HospitalPatient.find({})
    .select("_id phone phoneKey")
    .lean()
    .cursor({ batchSize: BATCH });

  for await (const p of cursor as any) {
    scanned++;
    const want = toPhoneKey(p.phone);
    if (p.phoneKey === want) continue;
    ops.push({
      updateOne: { filter: { _id: p._id }, update: { $set: { phoneKey: want } } },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  const missing = await HospitalPatient.countDocuments({
    $or: [{ phoneKey: { $exists: false } }, { phoneKey: "" }],
  });

  await mongoose.disconnect();
  console.log(`\n  scanned ${scanned} of ${total}, updated ${updated}`);
  console.log(
    missing
      ? `  ⚠️  ${missing} record(s) still have no key — their phone has fewer than 10 digits and the portal cannot match them.`
      : "  ✅ every patient has a usable phone key",
  );
  console.log("");
  process.exit(0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
