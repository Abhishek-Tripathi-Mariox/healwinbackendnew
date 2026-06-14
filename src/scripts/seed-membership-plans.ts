/**
 * Seed default HealWin membership plans. These are STARTER values — edit
 * price/benefits/order anytime from the admin panel; the patient app reflects
 * changes immediately.
 *
 * Idempotent: existing rows (matched by name, case-insensitive) are skipped.
 *
 * Usage: npx ts-node src/scripts/seed-membership-plans.ts
 */

import mongoose from "mongoose";
import config from "../config";
import { MembershipPlan } from "../models/membership.model";

const DEFAULTS = [
  {
    tier: "silver" as const,
    name: "Silver Care",
    price: 999,
    durationMonths: 12,
    concessionPercent: 10,
    bullets: [
      "10% concession on all HealWin services",
      "One free family health check-up per year",
      "Emergency outstation support with prioritized coordination & transport",
    ],
    sortOrder: 1,
  },
  {
    tier: "gold" as const,
    name: "Gold Shield",
    price: 1999,
    durationMonths: 12,
    concessionPercent: 15,
    bullets: [
      "15% concession on all HealWin services",
      "Two free family health check-ups per year",
      "Priority ambulance dispatch in emergencies",
    ],
    sortOrder: 2,
  },
];

const run = async () => {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(config.database.url);
  console.log("✅ Connected");

  console.log("\n💳 Seeding membership plans...");
  let created = 0;
  let skipped = 0;
  for (const p of DEFAULTS) {
    const existing = await MembershipPlan.collection.findOne({
      name: { $regex: `^${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) {
      console.log(`  ⏭️  "${p.name}" already exists`);
      skipped++;
      continue;
    }
    await MembershipPlan.create({ ...p, isActive: true, isDeleted: false });
    console.log(`  ✅ Created "${p.name}" (₹${p.price}/${p.durationMonths}mo)`);
    created++;
  }

  console.log(`\nDone — created ${created}, skipped ${skipped}.`);
  console.log("Edit these anytime in admin → Membership.");
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
