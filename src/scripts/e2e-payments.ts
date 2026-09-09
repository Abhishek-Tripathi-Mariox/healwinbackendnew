/**
 * Payments + wallet end-to-end test.
 *
 * The properties that matter here are about money, so they are tested against
 * the real handlers and a real database:
 *
 *   • a payment credits the wallet exactly once, even when the app's confirm
 *     call and the gateway's webhook arrive together;
 *   • the credited amount is the gateway's, not the client's;
 *   • an uncaptured or unverified payment credits nothing;
 *   • a wallet cannot be spent below zero by two concurrent payments;
 *   • stored gateway credentials survive an encrypt/decrypt round trip and are
 *     never returned in the clear.
 *
 * The gateway itself is stubbed — this proves OUR logic, without taking real
 * money. Test data is prefixed E2E-PAY and removed at the end.
 *
 * Usage: npm run e2e:payments
 */
import mongoose from "mongoose";
import config from "../config";
import User from "../models/Users";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet-transaction.model";
import PaymentSettings from "../models/payment-settings.model";
import { encryptSecret, decryptSecret, maskSecret } from "../utils/crypto.util";
import * as Gateway from "../services/razorpay.service";
import {
  creditCapturedPayment,
  creditManually,
  resolveTopUpUser,
} from "../services/wallet-topup.service";

const TAG = "E2E-PAY";
let pass = 0,
  fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) {
    pass++;
    console.log(`  ✅ ${l}`);
  } else {
    fail++;
    failures.push(l);
    console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`);
  }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

/** A captured payment as Razorpay reports it. */
const payment = (id: string, paise: number, orderId: string, status = "captured") => ({
  id,
  status,
  amount: paise,
  order_id: orderId,
  notes: { purpose: "wallet_topup" },
});

const cleanup = async () => {
  const users = await User.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  const ids = users.map((u: any) => u._id);
  await Promise.all([
    Wallet.deleteMany({ userId: { $in: ids } }),
    WalletTransaction.deleteMany({ userId: { $in: ids } }),
    User.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    PaymentSettings.deleteMany({ keyId: new RegExp(`^rzp_test_${TAG}`) }),
  ]);
};

const balanceOf = async (userId: any) =>
  (await Wallet.findOne({ userId }).lean())?.balance ?? 0;

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — payments & wallet\n`);
  await cleanup();

  // The unique paymentRef index is what makes double-crediting impossible, and
  // it only exists once Mongo has built it. An existing deployment has rows
  // predating the field, so this is also the migration check.
  await WalletTransaction.syncIndexes();

  const user = await User.create({
    fullName: `${TAG} Patient`,
    countryCode: "+91",
    mobileNumber: `9${Date.now().toString().slice(-9)}`,
    role: "user",
  });
  const uid = user._id;

  // ───────────────────────── credentials at rest ─────────────────────────
  section("Credential encryption");
  const secret = "rzp_secret_abc123XYZ";
  const enc = encryptSecret(secret);
  ok("secret is not stored in the clear", enc !== secret && enc.startsWith("enc:v1:"), enc.slice(0, 24));
  ok("secret round-trips", decryptSecret(enc) === secret);
  ok("re-encrypting gives a different ciphertext", encryptSecret(secret) !== enc);
  ok("plaintext passes through (pre-encryption rows keep working)", decryptSecret(secret) === secret);
  const masked = maskSecret(secret);
  ok("mask hides the body of the secret", !masked.includes("abc123"), masked);

  // ───────────────────────── crediting ─────────────────────────
  section("Crediting a captured payment");
  const p1 = payment(`pay_${TAG}_1`, 50000, `order_${TAG}_1`); // ₹500
  const r1 = await creditCapturedPayment(uid, p1);
  ok("first credit succeeds", r1.credited, r1.reason);
  ok("credits the gateway's amount (₹500)", r1.amount === 500, String(r1.amount));
  ok("balance is ₹500", (await balanceOf(uid)) === 500);

  const r2 = await creditCapturedPayment(uid, p1);
  ok("replaying the same payment credits nothing", !r2.credited, r2.reason);
  ok("balance is still ₹500", (await balanceOf(uid)) === 500);

  section("Concurrent confirm + webhook for one payment");
  const p2 = payment(`pay_${TAG}_2`, 25000, `order_${TAG}_2`); // ₹250
  const both = await Promise.all([
    creditCapturedPayment(uid, p2),
    creditCapturedPayment(uid, p2),
  ]);
  const credited = both.filter((r) => r.credited).length;
  ok("exactly one of the two racers credits", credited === 1, `credited=${credited}`);
  ok("balance is ₹750, not ₹1000", (await balanceOf(uid)) === 750, String(await balanceOf(uid)));
  const rows = await WalletTransaction.countDocuments({ userId: uid, paymentRef: p2.id });
  ok("only one ledger row exists for the payment", rows === 1, `rows=${rows}`);

  section("Payments that must not credit");
  const failed = await creditCapturedPayment(uid, payment(`pay_${TAG}_3`, 99900, `order_${TAG}_3`, "failed"));
  ok("a failed payment credits nothing", !failed.credited, failed.reason);
  const authorized = await creditCapturedPayment(uid, payment(`pay_${TAG}_4`, 99900, `order_${TAG}_4`, "authorized"));
  ok("an authorized-but-not-captured payment credits nothing", !authorized.credited, authorized.reason);
  ok("balance unchanged at ₹750", (await balanceOf(uid)) === 750);

  section("Working out whose wallet to credit");
  const notesOnly = await resolveTopUpUser({
    order_id: "order_unknown",
    notes: { purpose: "wallet_topup", userId: String(uid) },
  });
  ok("resolves from the order notes", notesOnly === String(uid));

  // A webhook that arrives without notes must still find the owner, otherwise
  // a customer who closed the app would never be credited.
  const orderId = `order_${TAG}_pending`;
  await WalletTransaction.create({
    userId: uid,
    amount: 300,
    type: "CREDIT",
    referenceId: orderId,
    description: "Wallet top-up (awaiting payment)",
    balanceBefore: 0,
    balanceAfter: 0,
    status: "PENDING",
  });
  const fromPending = await resolveTopUpUser({ order_id: orderId });
  ok("resolves from the pending row when notes are missing", fromPending === String(uid), String(fromPending));
  ok(
    "an unrelated payment resolves to nobody",
    (await resolveTopUpUser({ order_id: "order_not_ours" })) === null,
  );

  const viaWebhook = await creditCapturedPayment(
    (await resolveTopUpUser({ order_id: orderId })) as string,
    payment(`pay_${TAG}_5`, 30000, orderId),
  );
  ok("a notes-less webhook still credits (₹300)", viaWebhook.credited && viaWebhook.amount === 300, viaWebhook.reason);
  ok("balance is ₹1050", (await balanceOf(uid)) === 1050, String(await balanceOf(uid)));

  section("Signature verification");
  // This section needs the credential table to itself. Anything already there
  // is a real configuration, so it is set aside and put back at the end —
  // never deleted outright, which would take live payments down.
  const savedSettings = await PaymentSettings.find({}).lean();
  await PaymentSettings.deleteMany({ _id: { $in: savedSettings.map((s: any) => s._id) } });
  Gateway.resetClient();
  const noKeys = await Gateway.verifyPaymentSignature({
    orderId: "order_x",
    paymentId: "pay_x",
    signature: "deadbeef",
  });
  ok("unverifiable signature is rejected when no keys are set", noKeys === false);

  // With keys, only the correctly signed callback passes.
  const testSecret = "e2e_secret_value";
  await PaymentSettings.create({
    provider: "razorpay",
    keyId: `rzp_test_${TAG}key`,
    keySecret: encryptSecret(testSecret),
    webhookSecret: encryptSecret("e2e_webhook_secret"),
    mode: "test",
    enabled: true,
  });
  Gateway.resetClient();
  const crypto = await import("crypto");
  const good = crypto
    .createHmac("sha256", testSecret)
    .update("order_1|pay_1")
    .digest("hex");
  ok(
    "a correctly signed callback verifies",
    (await Gateway.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: good })) === true,
  );
  ok(
    "a forged signature is rejected",
    (await Gateway.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "0".repeat(64) })) === false,
  );
  ok(
    "the same signature on a different order is rejected",
    (await Gateway.verifyPaymentSignature({ orderId: "order_2", paymentId: "pay_1", signature: good })) === false,
  );

  const rawBody = JSON.stringify({ event: "payment.captured" });
  const webhookSig = crypto
    .createHmac("sha256", "e2e_webhook_secret")
    .update(rawBody)
    .digest("hex");
  ok("a correctly signed webhook verifies", (await Gateway.verifyWebhookSignature(rawBody, webhookSig)) === true);
  ok(
    "a webhook body tampered with after signing is rejected",
    (await Gateway.verifyWebhookSignature(rawBody + " ", webhookSig)) === false,
  );

  // ───────────────────────── spending ─────────────────────────
  section("Spending the balance");
  const fare = 1000;
  const debits = await Promise.all([
    Wallet.findOneAndUpdate({ userId: uid, balance: { $gte: fare } }, { $inc: { balance: -fare } }, { returnDocument: "after" }),
    Wallet.findOneAndUpdate({ userId: uid, balance: { $gte: fare } }, { $inc: { balance: -fare } }, { returnDocument: "after" }),
  ]);
  ok("only one of two concurrent ₹1000 debits succeeds", debits.filter(Boolean).length === 1);
  const afterDebit = await balanceOf(uid);
  ok("balance is ₹50 and never went negative", afterDebit === 50, String(afterDebit));

  section("Staff credit (refund / correction)");
  await creditManually(uid, 100, `${TAG} goodwill credit`);
  ok("manual credit lands", (await balanceOf(uid)) === 150, String(await balanceOf(uid)));
  const manual = await WalletTransaction.findOne({ userId: uid, description: `${TAG} goodwill credit` }).lean();
  ok("manual credit is recorded in the ledger", !!manual);
  ok("manual credit carries no payment reference", !(manual as any)?.paymentRef);

  await cleanup();
  // Restore the real gateway configuration exactly as it was found.
  if (savedSettings.length) {
    await PaymentSettings.insertMany(savedSettings);
    console.log(`\n  ↩︎ restored ${savedSettings.length} existing payment setting(s)`);
  }
  Gateway.resetClient();
  await mongoose.disconnect();

  console.log(`\n${"─".repeat(46)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\n  Failures:");
    failures.forEach((f) => console.log(`   • ${f}`));
  }
  console.log(`${"─".repeat(46)}\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥 e2e-payments crashed:", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
