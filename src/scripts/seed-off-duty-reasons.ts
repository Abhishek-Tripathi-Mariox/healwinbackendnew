/**
 * Seed script to initialize default off-duty reasons.
 *
 * Idempotent: existing rows (matched by label, case-insensitive) are left
 * alone so admin edits aren't clobbered on a re-run.
 *
 * Usage: npx ts-node src/scripts/seed-off-duty-reasons.ts
 */

import mongoose from "mongoose";
import config from "../config";
import OffDutyReason from "../models/off-duty-reason.model";

const DEFAULTS = [
  "End of shift",
  "Meal break",
  "Vehicle maintenance",
  "Refueling",
  "Personal emergency",
  "Medical reason",
  "Other",
];

const run = async () => {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(config.database.url);
  console.log("✅ Connected");

  console.log("\n📋 Seeding off-duty reasons...");
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < DEFAULTS.length; i++) {
    const label = DEFAULTS[i];
    const existing = await OffDutyReason.collection.findOne({
      label: { $regex: `^${label}$`, $options: "i" },
    });
    if (existing) {
      console.log(`  ⏭️  "${label}" already exists`);
      skipped++;
      continue;
    }
    await OffDutyReason.create({
      label,
      isActive: true,
      sortOrder: i,
    });
    console.log(`  ✅ Created "${label}"`);
    created++;
  }

  console.log(`\nDone — created ${created}, skipped ${skipped}.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
