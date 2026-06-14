/**
 * Seed script to initialize ambulance VehicleTypes (the admin "Types & Pricing"
 * source of truth that the patient app's ambulance booking reads from).
 *
 * These are DEFAULT starter rates — edit them anytime from the admin panel
 * (Types & Pricing) and the patient app picks up the new fares immediately.
 *
 * Idempotent: existing rows (matched by name, case-insensitive) are left
 * alone so admin edits aren't clobbered on a re-run.
 *
 * Usage: npx ts-node src/scripts/seed-ambulance-types.ts
 */

import mongoose from "mongoose";
import config from "../config";
import VehicleType from "../models/vehicle-type.model";

// baseFare = flat pickup charge; perKmRate = ₹/km beyond minDistanceKm;
// perMinuteRate kept 0 for ambulances (we charge by distance, not time).
const DEFAULTS = [
  {
    name: "Basic Life Support (BLS)",
    description: "Equipped BLS ambulance for safe, stable medical transport.",
    maxWeightKg: 200,
    baseFare: 800,
    perKmRate: 35,
    perMinuteRate: 0,
    minDistanceKm: 2,
    minRangeKm: 1,
    maxRangeKm: 150,
    sortOrder: 1,
  },
  {
    name: "Advanced Life Support (ALS)",
    description: "Critical-care ALS ambulance with advanced equipment & paramedic.",
    maxWeightKg: 200,
    baseFare: 1500,
    perKmRate: 50,
    perMinuteRate: 0,
    minDistanceKm: 2,
    minRangeKm: 1,
    maxRangeKm: 200,
    sortOrder: 2,
  },
  {
    name: "ICU Ambulance",
    description: "ICU-on-wheels with ventilator and full intensive-care setup.",
    maxWeightKg: 200,
    baseFare: 2500,
    perKmRate: 65,
    perMinuteRate: 0,
    minDistanceKm: 2,
    minRangeKm: 1,
    maxRangeKm: 300,
    sortOrder: 3,
  },
  {
    name: "4x4 Patient Transport",
    description: "Rugged 4x4 patient transport for difficult terrain.",
    maxWeightKg: 250,
    baseFare: 1200,
    perKmRate: 45,
    perMinuteRate: 0,
    minDistanceKm: 2,
    minRangeKm: 1,
    maxRangeKm: 250,
    allowInterCity: true,
    sortOrder: 4,
  },
  {
    name: "Hearse Van",
    description: "Dignified mortuary transport (hearse) van.",
    maxWeightKg: 200,
    baseFare: 1000,
    perKmRate: 40,
    perMinuteRate: 0,
    minDistanceKm: 2,
    minRangeKm: 1,
    maxRangeKm: 300,
    allowInterCity: true,
    sortOrder: 5,
  },
];

const run = async () => {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(config.database.url);
  console.log("✅ Connected");

  console.log("\n🚑 Seeding ambulance types (VehicleType)...");
  let created = 0;
  let skipped = 0;
  for (const t of DEFAULTS) {
    const existing = await VehicleType.collection.findOne({
      name: { $regex: `^${t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) {
      console.log(`  ⏭️  "${t.name}" already exists`);
      skipped++;
      continue;
    }
    await VehicleType.create({ ...t, category: "ambulance", isActive: true, isDeleted: false });
    console.log(`  ✅ Created "${t.name}" (base ₹${t.baseFare}, ₹${t.perKmRate}/km)`);
    created++;
  }

  console.log(`\nDone — created ${created}, skipped ${skipped}.`);
  console.log("Edit these anytime in admin → Types & Pricing.");
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
