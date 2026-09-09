/**
 * Index audit.
 *
 * Runs `explain()` for the queries the list screens and app feeds actually
 * make, and reports which ones cannot use an index. This is the only reliable
 * way to answer the question — a collection can carry a dozen indexes and
 * still collection-scan, because what matters is whether an index matches the
 * FILTER AND SORT TOGETHER.
 *
 * The verdict is valid regardless of how much data is present locally: the
 * planner picks the same plan for 5 rows as for 500,000. What changes with
 * volume is only the cost of getting it wrong.
 *
 * Usage: npm run audit:indexes
 */
import mongoose from "mongoose";
import config from "../config";

interface Probe {
  collection: string;
  label: string;
  filter: Record<string, any>;
  sort?: Record<string, 1 | -1>;
}

/** The queries behind the busiest screens, as the controllers issue them. */
const PROBES: Probe[] = [
  // ---- Ambulance / dispatch ----
  { collection: "bookings", label: "Bookings list (admin)", filter: {}, sort: { createdAt: -1 } },
  { collection: "bookings", label: "Bookings by status", filter: { status: "PENDING" }, sort: { createdAt: -1 } },
  { collection: "bookings", label: "My bookings (patient app)", filter: { userId: new mongoose.Types.ObjectId() }, sort: { createdAt: -1 } },
  { collection: "ambulancerequests", label: "Ambulance requests list", filter: {}, sort: { createdAt: -1 } },
  { collection: "ambulancerequests", label: "Ambulance requests by status", filter: { status: "PENDING" }, sort: { createdAt: -1 } },
  { collection: "emergencydispatches", label: "Dispatches list", filter: {}, sort: { dispatchedAt: -1 } },

  // ---- SOS ----
  { collection: "sossubmissions", label: "SOS list by type", filter: { type: "CALL" }, sort: { createdAt: -1 } },
  { collection: "sossubmissions", label: "SOS by type + status", filter: { type: "CALL", status: "PENDING" }, sort: { createdAt: -1 } },
  { collection: "sosalerts", label: "SOS alerts list", filter: {}, sort: { createdAt: -1 } },

  // ---- Money ----
  { collection: "wallettransactions", label: "Wallet statement", filter: { userId: new mongoose.Types.ObjectId() }, sort: { createdAt: -1 } },
  { collection: "hospitalinvoices", label: "Invoices list", filter: {}, sort: { createdAt: -1 } },
  { collection: "hospitalinvoices", label: "Invoices by patient", filter: { patientId: new mongoose.Types.ObjectId() }, sort: { createdAt: -1 } },

  // ---- People ----
  // Both list endpoints always constrain `isDeleted` — an unfiltered probe
  // would be testing a query the app never makes.
  { collection: "users", label: "Users list", filter: { isDeleted: false }, sort: { createdAt: -1 } },
  { collection: "users", label: "Users by role", filter: { isDeleted: false, role: "user" }, sort: { createdAt: -1 } },
  { collection: "hospitalpatients", label: "Patients list", filter: { isDeleted: false }, sort: { createdAt: -1 } },
  { collection: "hremployees", label: "Employees list", filter: { isDeleted: false }, sort: { createdAt: -1 } },

  // ---- HR ----
  { collection: "attendances", label: "Attendance by date", filter: { date: new Date(), subjectType: "hr_employee" } },
  { collection: "leaverequests", label: "Leave requests", filter: { status: "pending" }, sort: { createdAt: -1 } },
  { collection: "payslips", label: "Payslips of a run", filter: { runId: new mongoose.Types.ObjectId() } },

  // ---- High-churn logs ----
  { collection: "notifications", label: "My notifications", filter: { userId: new mongoose.Types.ObjectId() }, sort: { createdAt: -1 } },
  { collection: "notifications", label: "Unread count", filter: { userId: new mongoose.Types.ObjectId(), isRead: false } },
  { collection: "activitylogs", label: "Activity log", filter: {}, sort: { createdAt: -1 } },
  { collection: "calllogs", label: "Call log", filter: {}, sort: { startedAt: -1 } },
  { collection: "careerapplications", label: "Applications list", filter: {}, sort: { createdAt: -1 } },
  { collection: "supporttickets", label: "Support tickets", filter: { status: "OPEN" }, sort: { createdAt: -1 } },

  // ---- Clinical ----
  // The OPD board queries a day's range and orders by token — not createdAt.
  { collection: "appointments", label: "OPD board (day)", filter: { scheduledAt: { $gte: new Date(), $lt: new Date() } }, sort: { scheduledAt: 1, tokenNumber: 1 } },
  { collection: "appointments", label: "OPD board (day + doctor)", filter: { scheduledAt: { $gte: new Date(), $lt: new Date() }, doctorId: new mongoose.Types.ObjectId() }, sort: { scheduledAt: 1, tokenNumber: 1 } },
  { collection: "admissions", label: "Admissions list", filter: {}, sort: { createdAt: -1 } },
  { collection: "consultations", label: "Consultations list", filter: {}, sort: { createdAt: -1 } },
];

const stageNames = (plan: any, out: string[] = []): string[] => {
  if (!plan) return out;
  out.push(plan.stage);
  (plan.inputStages || (plan.inputStage ? [plan.inputStage] : [])).forEach((s: any) =>
    stageNames(s, out),
  );
  return out;
};

const run = async () => {
  await mongoose.connect(config.database.url);
  const db = mongoose.connection.db!;
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name),
  );

  const bad: string[] = [];
  let ok = 0;
  let skipped = 0;

  for (const p of PROBES) {
    if (!existing.has(p.collection)) {
      skipped++;
      console.log(`  ⏭  ${p.label} — collection "${p.collection}" not created yet`);
      continue;
    }
    let cursor = db.collection(p.collection).find(p.filter);
    if (p.sort) cursor = cursor.sort(p.sort as any);
    const ex: any = await cursor.limit(20).explain("queryPlanner");
    const stages = stageNames(ex.queryPlanner?.winningPlan);
    const collscan = stages.includes("COLLSCAN");
    // A SORT stage means the documents are sorted in memory after fetching.
    // That is the failure that bites at scale: it buffers the whole result and
    // aborts past 32MB unless disk use is enabled.
    const memSort = stages.includes("SORT");

    if (collscan || memSort) {
      bad.push(
        `${p.collection} — ${p.label}${collscan ? " [COLLSCAN]" : ""}${memSort ? " [in-memory SORT]" : ""}`,
      );
      console.log(
        `  ❌ ${p.label}\n       ${p.collection}  ${collscan ? "COLLSCAN " : ""}${memSort ? "in-memory SORT" : ""}`,
      );
    } else {
      ok++;
      console.log(`  ✅ ${p.label}`);
    }
  }

  await mongoose.disconnect();
  console.log(`\n${"─".repeat(58)}`);
  console.log(`  ${ok} indexed, ${bad.length} needing an index, ${skipped} skipped`);
  if (bad.length) {
    console.log("\n  Queries that would scan the whole collection at 100k rows:");
    bad.forEach((b) => console.log(`   • ${b}`));
  }
  console.log(`${"─".repeat(58)}\n`);
  process.exit(0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
