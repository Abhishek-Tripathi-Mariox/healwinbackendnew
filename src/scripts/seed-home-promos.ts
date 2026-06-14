/**
 * Seed default patient-app home promo cards. Edit copy/order/targets anytime
 * from the admin panel — the app reflects changes without a release.
 *
 * Idempotent: existing rows (matched by target, case-insensitive) are skipped.
 *
 * Usage: npx ts-node src/scripts/seed-home-promos.ts
 */

import mongoose from "mongoose";
import config from "../config";
import HomePromo from "../models/home-promo.model";

const DEFAULTS = [
  { titleTop: "Know Your", titleBold: ["Life Support", "Vehicle"], cta: "Book Now", target: "AmbulanceTypes", sortOrder: 1 },
  { titleTop: "Need help fast?", titleBold: ["Book an", "Ambulance"], cta: "Book Now", target: "PlanAmbulance", sortOrder: 2 },
  { titleTop: "Find the nearest", titleBold: ["Healthcare", "Centre"], cta: "Locate", target: "ServiceSelect", sortOrder: 3 },
  { titleTop: "Save more with", titleBold: ["HealWin", "Membership"], cta: "Join Now", target: "Membership", sortOrder: 4 },
];

const run = async () => {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(config.database.url);
  console.log("✅ Connected");

  console.log("\n🏷️  Seeding home promos...");
  let created = 0;
  let skipped = 0;
  for (const p of DEFAULTS) {
    const existing = await HomePromo.collection.findOne({
      target: { $regex: `^${p.target}$`, $options: "i" },
    });
    if (existing) {
      console.log(`  ⏭️  promo → ${p.target} already exists`);
      skipped++;
      continue;
    }
    await HomePromo.create({ ...p, isActive: true, isDeleted: false });
    console.log(`  ✅ Created promo → ${p.target}`);
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
