/**
 * Build every index declared in the schemas.
 *
 * Uses `createIndexes()`, NOT `syncIndexes()`. syncIndexes drops any index the
 * schema does not declare — including ones added by hand against a live
 * database to fix a slow query. Dropping those during a routine deploy is how
 * a fix silently disappears; this only ever adds.
 *
 * Safe to re-run: an index that already exists is left alone. Index builds on
 * a large collection run in the background and do not block reads or writes.
 *
 * Usage: npm run migrate:indexes [--dry]
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import config from "../config";

const dry = process.argv.includes("--dry");

const run = async () => {
  await mongoose.connect(config.database.url);

  // Import every model so its schema — and therefore its indexes — is
  // registered. Listing them by hand is how a new model gets forgotten.
  const dir = path.join(__dirname, "..", "models");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts") && f !== "index.ts");
  for (const f of files) {
    try {
      require(path.join(dir, f));
    } catch (e: any) {
      console.warn(`  ⚠️  could not load ${f}: ${e.message}`);
    }
  }

  const names = mongoose.modelNames().sort();
  console.log(`\n${names.length} models registered\n`);

  let created = 0;
  let already = 0;
  const failures: string[] = [];

  for (const name of names) {
    const model = mongoose.model(name);
    const wanted = model.schema.indexes();
    if (!wanted.length) continue;

    let have: any[] = [];
    try {
      have = await model.collection.indexes();
    } catch {
      // Collection does not exist yet — every index is new.
    }
    const haveKeys = new Set(have.map((i) => JSON.stringify(i.key)));
    const missing = wanted.filter(
      ([key]: [Record<string, unknown>, ...unknown[]]) =>
        !haveKeys.has(JSON.stringify(key)),
    );

    already += wanted.length - missing.length;
    if (!missing.length) continue;

    console.log(`  ${name}`);
    for (const [key] of missing) console.log(`     + ${JSON.stringify(key)}`);
    if (dry) {
      created += missing.length;
      continue;
    }
    try {
      await model.createIndexes();
      created += missing.length;
    } catch (e: any) {
      // A duplicate-key failure means existing data violates a unique index —
      // worth reporting loudly rather than aborting the whole run.
      failures.push(`${name}: ${e.message}`);
      console.log(`     ❌ ${e.message}`);
    }
  }

  await mongoose.disconnect();
  console.log(`\n${"─".repeat(58)}`);
  console.log(
    `  ${already} already present, ${created} ${dry ? "would be created" : "created"}, ${failures.length} failed`,
  );
  if (failures.length) failures.forEach((f) => console.log(`   • ${f}`));
  console.log(`${"─".repeat(58)}\n`);
  process.exit(failures.length ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
