/**
 * Diagnose "applied from the website but it isn't in the admin portal".
 *
 * Runs the exact sequence the website performs — send OTP, verify, apply —
 * against a live API, then checks whether the row landed in the database the
 * admin portal reads. Prints where it breaks rather than guessing.
 *
 * Usage:
 *   npm run diagnose:careers                      # against localhost
 *   API_BASE=https://apis.healwin.in/v1/api npm run diagnose:careers
 *
 * It cleans up after itself. Safe to run against production.
 */
import mongoose from "mongoose";
import config from "../config";
import { Otp } from "../models/otp.model";
import { Career } from "../models/career.model";
import { CareerApplication } from "../models/career-application.model";

const BASE = process.env.API_BASE || "http://localhost:9050/v1/api";
const EMAIL = "healwin-diagnostic@example.com";
const PHONE = "9876500011";

const post = async (path: string, body: any) => {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch (e: any) {
    return { status: 0, body: { message: `network: ${e?.message}` } };
  }
};

(async () => {
  console.log(`API   : ${BASE}`);
  await mongoose.connect(config.database.url);
  console.log(`DB    : ${config.database.url.replace(/\/\/[^@]*@/, "//***@")}\n`);

  // ── 1. Is there anything to apply to, and what is already stored? ──
  const [careerTotal, careerActive, appTotal] = await Promise.all([
    Career.countDocuments({}),
    Career.countDocuments({ isActive: true }),
    CareerApplication.countDocuments({}),
  ]);
  console.log(`jobs        : ${careerTotal} total, ${careerActive} active`);
  console.log(`applications: ${appTotal} in the database`);

  if (appTotal > 0) {
    const recent: any[] = await CareerApplication.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select("applicationNumber name email status ackEmailStatus ackEmailError createdAt")
      .lean();
    console.log("\n  most recent applications:");
    recent.forEach((a) =>
      console.log(
        `   ${new Date(a.createdAt).toLocaleString("en-IN")}  ${a.applicationNumber || "(no number)"}  ` +
          `${a.name}  status=${a.status}  ack=${a.ackEmailStatus || "-"}` +
          (a.ackEmailError ? `  ⚠ ${a.ackEmailError}` : ""),
      ),
    );
    console.log(
      "\n  → Rows exist. If the admin portal shows none, the portal is pointed at a\n" +
        "    DIFFERENT backend than this database, or its filters are excluding them.",
    );
  }

  if (careerActive === 0) {
    console.log(
      "\n❌ No ACTIVE job openings — the website has nothing to apply to.\n" +
        "   Publish a job in the admin portal (Careers) and re-run.",
    );
    await mongoose.disconnect();
    return;
  }

  // ── 2. Walk the real submission path ──
  const career: any = await Career.findOne({ isActive: true }).lean();
  console.log(`\nApplying to: "${career.title}" (${career._id})\n`);

  for (const [type, id] of [["email", EMAIL], ["phone", PHONE]] as [string, string][]) {
    const send = await post("/careers/otp/send", { identifier: id, type });
    console.log(`  send-otp ${type.padEnd(5)} → ${send.status} ${JSON.stringify(send.body).slice(0, 100)}`);
    if (send.status !== 200) {
      console.log(`  ❌ OTP send failed for ${type}. Applications cannot be submitted at all.`);
      await mongoose.disconnect();
      return;
    }
    const row: any = await Otp.findOne({ identifier: id, type: type as "email" | "phone" })
      .sort({ createdAt: -1 })
      .lean();
    if (!row) {
      console.log("  ❌ OTP was not stored — check the Otp collection / TTL index.");
      await mongoose.disconnect();
      return;
    }
    const ver = await post("/careers/otp/verify", { identifier: id, type, otp: row.otp });
    console.log(`  verify   ${type.padEnd(5)} → ${ver.status} ${JSON.stringify(ver.body).slice(0, 100)}`);
    if (ver.status !== 200) {
      console.log("  ❌ Verification failed — nobody can complete an application.");
      await mongoose.disconnect();
      return;
    }
  }

  const fd = new FormData();
  fd.append("name", "Healwin Diagnostic");
  fd.append("email", EMAIL);
  fd.append("phone", PHONE);
  fd.append("dob", "1995-05-05");
  fd.append("gender", "Male");
  fd.append("department", career.department || "General");
  fd.append("position", career.title || "Role");
  fd.append("declaration", "true");

  let applyStatus = 0;
  let applyBody: any = {};
  try {
    const r = await fetch(`${BASE}/careers/${career._id}/apply`, { method: "POST", body: fd });
    applyStatus = r.status;
    applyBody = await r.json().catch(() => ({}));
  } catch (e: any) {
    applyBody = { message: `network: ${e?.message}` };
  }
  console.log(`\n  APPLY → ${applyStatus} ${JSON.stringify(applyBody).slice(0, 240)}`);

  const saved: any = await CareerApplication.findOne({ email: EMAIL })
    .sort({ createdAt: -1 })
    .lean();

  console.log("\n────────────────────────────────────────────");
  if (saved) {
    console.log(`✅ SAVED: ${saved.applicationNumber} — the pipeline works.`);
    console.log("   If the admin portal does not show it, the portal is reading a");
    console.log("   different database, or a filter on that screen is hiding it.");
  } else if (applyStatus === 413) {
    console.log("❌ 413 — the proxy rejected the upload as too large.");
    console.log("   Raise client_max_body_size in nginx (documents can be several MB).");
  } else if (applyStatus === 0) {
    console.log("❌ Could not reach the API at all. Check API_BASE and that the server is up.");
  } else {
    console.log(`❌ NOT SAVED. The API answered ${applyStatus}:`);
    console.log(`   ${applyBody?.message || "(no message)"}`);
  }
  console.log("────────────────────────────────────────────");

  await CareerApplication.deleteMany({ email: EMAIL });
  await Otp.deleteMany({ identifier: { $in: [EMAIL, PHONE] } as any });
  console.log("\ncleanup: diagnostic rows removed");
  await mongoose.disconnect();
})();
