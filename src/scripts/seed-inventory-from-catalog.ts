/**
 * Create an HMS InventoryItem for every PharmacyProduct that doesn't already
 * have one, and link the two (product.itemId -> item._id).
 *
 * Why: the patient-app catalogue (PharmacyProduct) and hospital stock
 * (InventoryItem) are separate collections. A prescription can only be
 * dispensed — i.e. actually decrement stock via FEFO — when the drug resolves
 * to an InventoryItem. A fresh install has a populated catalogue and an empty
 * inventory, so the doctor's medicine picker shows drugs as "catalogue only"
 * and the "Link to HMS inventory item" dropdown has nothing in it.
 *
 * Safe to re-run: products already carrying an itemId are skipped, and an
 * existing SKU is reused rather than duplicated.
 *
 * Usage: npm run seed:inventory-from-catalog
 */

import mongoose from "mongoose";
import config from "../config";
import PharmacyProduct from "../models/pharmacy-product.model";
import InventoryItem from "../models/inventory-item.model";
import { Admin } from "../models/admin.model";

/**
 * PharmacyProduct.category is free text ("First Aid", "Vitamins", "Devices")
 * but InventoryItem.category is a strict enum. Map on keywords and fall back to
 * "medicine" — the common case for a pharmacy catalogue.
 */
const mapCategory = (
  name: string,
  category?: string,
): "consumable" | "medicine" | "equipment" => {
  const hay = `${name} ${category || ""}`.toLowerCase();
  if (/device|equipment|thermometer|monitor|machine|meter|kit\b/.test(hay)) {
    return "equipment";
  }
  if (
    /antiseptic|liquid|bandage|gauze|cotton|hydration|ors|first aid|glove|mask|syringe/.test(
      hay,
    )
  ) {
    return "consumable";
  }
  return "medicine";
};

/** "Paracetamol 500mg (10 tabs)" -> "PARACETAMOL-500MG-10-TABS" */
const slugSku = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log("Connected to MongoDB");

  const admin = await Admin.findOne({ isDeleted: false, isActive: true })
    .sort({ createdAt: 1 })
    .select("_id fullName")
    .lean();
  if (!admin) {
    console.error("No active admin found — InventoryItem.createdByAdminId is required.");
    process.exit(1);
  }

  const products: any[] = await PharmacyProduct.find({
    isDeleted: { $ne: true },
    isActive: true,
  }).lean();
  console.log(`\nFound ${products.length} active catalogue product(s)\n`);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const p of products) {
    if (p.itemId) {
      console.log(`  ⏭  ${p.name} — already linked`);
      skipped++;
      continue;
    }

    const category = mapCategory(p.name, p.category);
    let sku = slugSku(p.name);

    // Reuse an existing item with this SKU rather than colliding on the
    // unique index; otherwise make the SKU unique with a short suffix.
    let item: any = await InventoryItem.findOne({ sku });
    if (item && item.isDeleted) {
      sku = `${sku}-${String(p._id).slice(-4).toUpperCase()}`;
      item = null;
    }

    if (!item) {
      item = await InventoryItem.create({
        name: p.name,
        sku,
        category,
        unit: category === "medicine" ? "strip" : "piece",
        currentStock: Number(p.stock) || 0,
        reorderThreshold: 10,
        sellingPrice: Number(p.price) || 0,
        isActive: true,
        isDeleted: false,
        createdByAdminId: admin._id,
        notes: "Auto-created from the patient-app pharmacy catalogue",
      });
      created++;
      console.log(
        `  ✅ ${p.name} → item ${sku} (${category}, ${item.currentStock} ${item.unit})`,
      );
    } else {
      console.log(`  ♻  ${p.name} — reusing existing item ${sku}`);
    }

    await PharmacyProduct.updateOne({ _id: p._id }, { $set: { itemId: item._id } });
    linked++;
  }

  console.log(
    `\nDone. ${created} item(s) created, ${linked} product(s) linked, ${skipped} already linked.`,
  );
  console.log(
    "The doctor's medicine picker and the catalogue's HMS dropdown will now be populated.",
  );
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
