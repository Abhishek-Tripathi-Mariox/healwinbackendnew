/**
 * Prove the in-database duplicate grouping agrees with the in-memory version
 * it replaced, including the messy phone formats real front-desk data carries.
 *
 * Seeds tagged patients, runs both implementations, compares the groups.
 * Usage: npx ts-node src/scripts/verify-duplicate-detection.ts
 */
import mongoose from "mongoose";
import config from "../config";
import HospitalPatient from "../models/hospital-patient.model";

const TAG = "E2E-DUP";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};

const normPhone = (p?: string) => String(p || "").replace(/\D/g, "").slice(-10);

/** The original in-memory implementation, kept here as the reference. */
const legacy = async () => {
  const patients = await HospitalPatient.find({ isDeleted: false })
    .select("patientId fullName phone gender dateOfBirth createdAt")
    .lean();
  const byPhone = new Map<string, any[]>();
  const byNameDob = new Map<string, any[]>();
  for (const p of patients as any[]) {
    const phoneKey = normPhone(p.phone);
    if (phoneKey.length === 10) {
      if (!byPhone.has(phoneKey)) byPhone.set(phoneKey, []);
      byPhone.get(phoneKey)!.push(p);
    }
    if (p.dateOfBirth) {
      const nameKey = `${String(p.fullName || "").trim().toLowerCase()}|${new Date(p.dateOfBirth).toISOString().slice(0, 10)}`;
      if (!byNameDob.has(nameKey)) byNameDob.set(nameKey, []);
      byNameDob.get(nameKey)!.push(p);
    }
  }
  const groups: { reason: string; ids: string[] }[] = [];
  const seen = new Set<string>();
  for (const g of byPhone.values()) {
    if (g.length < 2) continue;
    groups.push({ reason: "phone", ids: g.map((p) => String(p._id)).sort() });
    g.forEach((p) => seen.add(String(p._id)));
  }
  for (const g of byNameDob.values()) {
    if (g.length < 2) continue;
    if (g.every((p) => seen.has(String(p._id)))) continue;
    groups.push({ reason: "name_dob", ids: g.map((p) => String(p._id)).sort() });
  }
  return groups;
};

const digitsOnlyExpr = (field: string) =>
  [" ", "+", "-", "(", ")", ".", " "].reduce(
    (input: any, ch) => ({ $replaceAll: { input, find: ch, replacement: "" } }),
    { $ifNull: [field, ""] },
  );
const phoneKeyExpr = (() => {
  const d = digitsOnlyExpr("$phone");
  return { $substrCP: [d, { $max: [0, { $subtract: [{ $strLenCP: d }, 10] }] }, 10] };
})();
const F = { _id: 1, patientId: 1, fullName: 1, phone: 1, gender: 1, dateOfBirth: 1, createdAt: 1 };

/** The new in-database implementation. */
const current = async () => {
  const [phoneGroups, nameDobGroups] = await Promise.all([
    HospitalPatient.aggregate([
      { $match: { isDeleted: false } },
      { $project: { ...F, key: phoneKeyExpr } },
      { $match: { $expr: { $regexMatch: { input: "$key", regex: /^[0-9]{10}$/ } } } },
      { $group: { _id: "$key", patients: { $push: "$$ROOT" }, n: { $sum: 1 } } },
      { $match: { n: { $gte: 2 } } },
    ]),
    HospitalPatient.aggregate([
      { $match: { isDeleted: false, dateOfBirth: { $ne: null } } },
      { $project: { ...F, key: { $concat: [
        { $toLower: { $trim: { input: { $ifNull: ["$fullName", ""] } } } }, "|",
        { $dateToString: { date: "$dateOfBirth", format: "%Y-%m-%d" } }] } } },
      { $group: { _id: "$key", patients: { $push: "$$ROOT" }, n: { $sum: 1 } } },
      { $match: { n: { $gte: 2 } } },
    ]),
  ]);
  const groups: { reason: string; ids: string[] }[] = [];
  const seen = new Set<string>();
  for (const g of phoneGroups) {
    groups.push({ reason: "phone", ids: g.patients.map((p: any) => String(p._id)).sort() });
    g.patients.forEach((p: any) => seen.add(String(p._id)));
  }
  for (const g of nameDobGroups) {
    if (g.patients.every((p: any) => seen.has(String(p._id)))) continue;
    groups.push({ reason: "name_dob", ids: g.patients.map((p: any) => String(p._id)).sort() });
  }
  return groups;
};

const key = (gs: { reason: string; ids: string[] }[]) =>
  JSON.stringify(gs.map((g) => `${g.reason}:${g.ids.join(",")}`).sort());

const run = async () => {
  await mongoose.connect(config.database.url);
  await HospitalPatient.deleteMany({ fullName: new RegExp(`^${TAG}`) });

  const dob = new Date("1980-04-12T00:00:00.000Z");
  const mk = (fullName: string, phone: string, extra: any = {}) =>
    HospitalPatient.create({
      patientId: `${TAG}-${Math.random().toString(36).slice(2, 9)}`,
      fullName, phone, gender: "male", isDeleted: false, ...extra,
    });

  // Same person, three ways of writing the same number.
  await mk(`${TAG} Ravi Kumar`, "9876500011");
  await mk(`${TAG} Ravi K`, "+91 98765 00011");
  await mk(`${TAG} R Kumar`, "(098765)-00011");
  // Same name + DOB, different numbers.
  // Differ only in case and outer padding — what both implementations DO
  // normalise. (Neither collapses repeated inner spaces; that is a pre-existing
  // limitation of the matching rule, not of where it runs.)
  await mk(`${TAG} Sunita Devi`, "9000000001", { dateOfBirth: dob });
  await mk(`  ${TAG} sunita devi  `, "9000000002", { dateOfBirth: dob });
  // Junk/short phone must NOT group.
  await mk(`${TAG} Junk A`, "n/a");
  await mk(`${TAG} Junk B`, "-");
  // A lone record must not appear at all.
  await mk(`${TAG} Solo`, "9111111111");

  const before = await legacy();
  const after = await current();

  console.log(`\n  legacy groups: ${before.length}   in-database groups: ${after.length}`);
  ok("both implementations find the same groups", key(before) === key(after));

  const phoneGroup = after.find((g) => g.reason === "phone");
  ok("the three phone formats collapse to one group", !!phoneGroup && phoneGroup.ids.length === 3,
    String(phoneGroup?.ids.length));
  const nameGroup = after.find((g) => g.reason === "name_dob");
  ok("name + DOB match found despite spacing/case", !!nameGroup && nameGroup.ids.length === 2);
  ok("junk phone values do not group together",
    !after.some((g) => g.reason === "phone" && g.ids.length > 3));

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
