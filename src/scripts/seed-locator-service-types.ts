/**
 * Seed script for LocatorServiceType — the tab/category taxonomy behind the
 * Centre locator ("Health Centres, Pharmacies, Ambulances, Labs, etc.", per
 * the model's own comment). The locator (Centre model + /centres routes) was
 * already fully built, but this taxonomy was never seeded, so every category
 * filter came back empty. Idempotent: matched by slug, existing rows left
 * alone so admin edits aren't clobbered on a re-run.
 *
 * Usage: npx ts-node src/scripts/seed-locator-service-types.ts
 */

import mongoose from "mongoose";
import config from "../config";
import { LocatorServiceType } from "../models/locator-service-type.model";

const DEFAULTS = [
  {
    name: "Hospitals",
    slug: "hospitals",
    description: "Hospitals and health centres for emergency and OPD care.",
    icon: "Building2",
    sortOrder: 1,
  },
  {
    name: "Labs",
    slug: "labs",
    description: "Diagnostic and pathology labs for tests and reports.",
    icon: "FlaskConical",
    sortOrder: 2,
  },
  {
    name: "Pharmacies",
    slug: "pharmacies",
    description: "Pharmacies for medicines and home delivery.",
    icon: "Pill",
    sortOrder: 3,
  },
];

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log("Connected to MongoDB");

  let created = 0;
  let skipped = 0;
  for (const t of DEFAULTS) {
    const existing = await LocatorServiceType.findOne({ slug: t.slug });
    if (existing) {
      console.log(`  ⏭️  "${t.name}" already exists`);
      skipped++;
      continue;
    }
    await LocatorServiceType.create({ ...t, applicableTo: "centre_locator", isActive: true });
    console.log(`  ✅ Created "${t.name}" (slug: ${t.slug})`);
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
