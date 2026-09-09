/**
 * Build the wallet ledger's indexes on an existing database.
 *
 * The unique `paymentRef` index is what guarantees a gateway payment can only
 * ever be credited once — the app's confirm call and the webhook race for it
 * deliberately. Mongo only creates it when told to, so this has to run once
 * against any database that existed before the field did.
 *
 * Safe to re-run.
 *
 * Usage: npm run migrate:wallet-indexes
 */
import mongoose from "mongoose";
import config from "../config";
import WalletTransaction from "../models/wallet-transaction.model";

const run = async () => {
  await mongoose.connect(config.database.url);

  // A duplicate here would mean a payment was already credited twice — worth
  // knowing about before the index build fails with a raw driver error.
  const dupes = await WalletTransaction.aggregate([
    { $match: { paymentRef: { $type: "string" } } },
    { $group: { _id: "$paymentRef", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (dupes.length) {
    console.error(
      `\n❌ ${dupes.length} payment(s) have more than one ledger row — these must be resolved by hand first:`,
    );
    dupes.forEach((d: any) => console.error(`   • ${d._id} (${d.n} rows)`));
    await mongoose.disconnect();
    process.exit(1);
  }

  await WalletTransaction.syncIndexes();
  const idx = await WalletTransaction.collection.indexes();
  const pr = idx.find((i: any) => i.key?.paymentRef);
  console.log(pr ? `✅ paymentRef index in place: ${JSON.stringify(pr.key)} unique=${pr.unique}` : "❌ paymentRef index missing");
  await mongoose.disconnect();
  process.exit(pr ? 0 : 1);
};

run().catch(async (e) => {
  console.error("💥 failed:", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
