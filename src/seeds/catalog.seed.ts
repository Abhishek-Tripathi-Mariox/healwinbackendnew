/**
 * Catalog seed — sample doctors, pharmacy products and lab tests so the
 * patient app shows real data immediately. Idempotent (upsert by name).
 *
 * Usage: npm run seed:catalog
 */
import mongoose from "mongoose";
import config from "../config";
import LabTest from "../models/lab-test.model";
import PharmacyProduct from "../models/pharmacy-product.model";

// Note: doctors are NOT seeded here — they are admin users with the "Doctor"
// role (created in Admin Management), the single source for both panel login
// and the app's doctor listing.

const PRODUCTS = [
  { name: "Paracetamol 500mg (10 tabs)", brand: "Calpol", category: "Fever & Pain", price: 30, mrp: 45, stock: 200, prescriptionRequired: false },
  { name: "Vitamin C 1000mg (20 tabs)", brand: "Limcee", category: "Vitamins", price: 180, mrp: 250, stock: 120, prescriptionRequired: false },
  { name: "ORS Hydration Powder", brand: "Electral", category: "Hydration", price: 22, mrp: 30, stock: 300, prescriptionRequired: false },
  { name: "Digital Thermometer", brand: "Dr Trust", category: "Devices", price: 199, mrp: 350, stock: 40, prescriptionRequired: false },
  { name: "Antiseptic Liquid 100ml", brand: "Dettol", category: "First Aid", price: 95, mrp: 120, stock: 90, prescriptionRequired: false },
];

const TESTS = [
  { name: "Complete Blood Count (CBC)", price: 299, mrp: 450, category: "Haematology", sampleType: "Blood", reportHours: 12, homeCollection: true },
  { name: "Lipid Profile", price: 499, mrp: 750, category: "Biochemistry", sampleType: "Blood", reportHours: 24, homeCollection: true },
  { name: "Thyroid Profile (T3 T4 TSH)", price: 399, mrp: 600, category: "Hormones", sampleType: "Blood", reportHours: 24, homeCollection: true },
  { name: "HbA1c (Diabetes)", price: 349, mrp: 500, category: "Diabetes", sampleType: "Blood", reportHours: 12, homeCollection: true },
  { name: "Vitamin D Total", price: 899, mrp: 1300, category: "Vitamins", sampleType: "Blood", reportHours: 48, homeCollection: true },
];

const seed = async () => {
  try {
    await mongoose.connect(config.database.url);
    console.log("✅ Connected to MongoDB");

    for (const p of PRODUCTS) await PharmacyProduct.findOneAndUpdate({ name: p.name }, p, { upsert: true });
    console.log(`  ✅ Seeded ${PRODUCTS.length} pharmacy products`);

    for (const t of TESTS) await LabTest.findOneAndUpdate({ name: t.name }, t, { upsert: true });
    console.log(`  ✅ Seeded ${TESTS.length} lab tests`);

    console.log("\n🎉 Catalog seed complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Catalog seed failed:", err);
    process.exit(1);
  }
};

seed();
