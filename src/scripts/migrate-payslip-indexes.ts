/**
 * Replace the payslip uniqueness indexes.
 *
 * The old pair were unique+sparse on {employeeId, month, year} and
 * {ambulanceStaffId, month, year}. A payslip always has ONE of those ids and
 * null for the other, and a sparse index still indexes an explicit null — so
 * the second HR-employee payslip of a month collided with the first on
 * {ambulanceStaffId: null, ...} and payroll failed with E11000.
 *
 * Mongoose never alters an index that already exists, so this has to be done
 * explicitly. Safe to re-run.
 *
 * Usage: npm run migrate:payslip-indexes
 */
import mongoose from "mongoose";
import config from "../config";

const OLD = [
  "employeeId_1_month_1_year_1",
  "ambulanceStaffId_1_month_1_year_1",
];

const run = async () => {
  await mongoose.connect(config.database.url);
  const col = mongoose.connection.db!.collection("payslips");
  const existing = await col.indexes();
  console.log("Before:");
  existing.forEach((i: any) =>
    console.log(`  ${i.name} unique=${!!i.unique} sparse=${!!i.sparse} partial=${JSON.stringify(i.partialFilterExpression) || "-"}`),
  );

  for (const name of OLD) {
    const idx: any = existing.find((i: any) => i.name === name);
    if (!idx) continue;
    if (idx.partialFilterExpression) {
      console.log(`  ⏭️  ${name} is already partial`);
      continue;
    }
    await col.dropIndex(name);
    console.log(`  🗑️  dropped ${name}`);
  }

  await col.createIndex(
    { employeeId: 1, month: 1, year: 1 },
    { unique: true, partialFilterExpression: { employeeId: { $type: "objectId" } }, name: OLD[0] },
  );
  await col.createIndex(
    { ambulanceStaffId: 1, month: 1, year: 1 },
    { unique: true, partialFilterExpression: { ambulanceStaffId: { $type: "objectId" } }, name: OLD[1] },
  );

  console.log("\nAfter:");
  (await col.indexes()).forEach((i: any) =>
    console.log(`  ${i.name} unique=${!!i.unique} sparse=${!!i.sparse} partial=${JSON.stringify(i.partialFilterExpression) || "-"}`),
  );
  console.log("\n✅ Payslip indexes migrated — payroll can now process more than one employee per month.");
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error("❌ migration failed:", e);
  process.exit(1);
});
