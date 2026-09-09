/**
 * `phoneKey` must stay in step with `phone` on every write path, and the
 * portal lookup must use the index.
 *
 * A stale or missing key fails silently — the patient simply stops being
 * linked to their hospital records — so this checks each write path.
 *
 * Usage: npx ts-node src/scripts/verify-patient-phonekey.ts
 */
import mongoose from "mongoose";
import config from "../config";
import HospitalPatient, { toPhoneKey } from "../models/hospital-patient.model";

const TAG = "E2E-PKEY";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const keyOf = async (id: any) =>
  (await HospitalPatient.findById(id).select("phoneKey").lean() as any)?.phoneKey;

const run = async () => {
  await mongoose.connect(config.database.url);
  await HospitalPatient.deleteMany({ fullName: new RegExp(`^${TAG}`) });

  // create()
  const a = await HospitalPatient.create({
    patientId: `${TAG}-A`, fullName: `${TAG} Created`, phone: "+91 98765 00011", gender: "male",
  });
  ok("create() sets the key", (await keyOf(a._id)) === "9876500011", await keyOf(a._id));

  // save() after editing the phone
  a.phone = "(0)91-99999-12345";
  await a.save();
  ok("save() refreshes the key when the phone changes",
    (await keyOf(a._id)) === toPhoneKey("(0)91-99999-12345"), await keyOf(a._id));

  // findOneAndUpdate with $set
  await HospitalPatient.findOneAndUpdate({ _id: a._id }, { $set: { phone: "9000000001" } });
  ok("findOneAndUpdate($set) refreshes the key", (await keyOf(a._id)) === "9000000001", await keyOf(a._id));

  // findOneAndUpdate with a bare field
  await HospitalPatient.findOneAndUpdate({ _id: a._id }, { phone: "9000000002" });
  ok("findOneAndUpdate(bare) refreshes the key", (await keyOf(a._id)) === "9000000002", await keyOf(a._id));

  // updateOne
  await HospitalPatient.updateOne({ _id: a._id }, { $set: { phone: "9000000003" } });
  ok("updateOne refreshes the key", (await keyOf(a._id)) === "9000000003", await keyOf(a._id));

  // An update that does not touch the phone must leave the key alone.
  await HospitalPatient.updateOne({ _id: a._id }, { $set: { gender: "female" } });
  ok("an unrelated update leaves the key intact", (await keyOf(a._id)) === "9000000003");

  // The lookup finds the record by the tail of a differently-formatted number.
  const found = await HospitalPatient.find({
    phoneKey: toPhoneKey("+91 90000 00003"), isDeleted: { $ne: true },
  }).select("_id").lean();
  ok("portal lookup matches across formatting", found.some((p: any) => String(p._id) === String(a._id)));

  // And it does so with an index, not a scan.
  const ex: any = await mongoose.connection.db!
    .collection("hospitalpatients")
    .find({ phoneKey: "9000000003", isDeleted: { $ne: true } })
    .explain("queryPlanner");
  const stages: string[] = [];
  (function walk(p: any) {
    if (!p) return;
    stages.push(p.stage);
    (p.inputStages || (p.inputStage ? [p.inputStage] : [])).forEach(walk);
  })(ex.queryPlanner?.winningPlan);
  ok("the lookup uses an index (no COLLSCAN)", !stages.includes("COLLSCAN"), stages.join(" > "));

  await HospitalPatient.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await mongoose.disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
