/**
 * One-time migration: move legacy ambulance StaffLeave rows into the central
 * LeaveRequest store (subjectType "ambulance_staff") so all leaves live in one
 * place and show on the HR Leave page.
 *
 * Idempotent: skips StaffLeave rows already migrated (matched by ambulanceStaffId
 * + fromDate + toDate + type).
 *
 * Usage: npx ts-node src/scripts/migrate-staff-leaves.ts
 */

import mongoose from "mongoose";
import config from "../config";
import { StaffLeave } from "../models/ambulance-staff-extras.model";
import LeaveRequest from "../models/leave-request.model";

const statusMap: Record<string, string> = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
};
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const run = async () => {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(config.database.url);
  console.log("✅ Connected");

  const legacy = await StaffLeave.find({}).lean();
  console.log(`\n📦 ${legacy.length} legacy StaffLeave rows found.`);
  let created = 0, skipped = 0;
  for (const l of legacy as any[]) {
    const exists = await LeaveRequest.findOne({
      subjectType: "ambulance_staff",
      ambulanceStaffId: l.staffId,
      fromDate: l.fromDate,
      toDate: l.toDate,
      leaveTypeName: l.type,
    }).lean();
    if (exists) { skipped++; continue; }
    const half = l.day === "Half Day";
    const ms = dayStart(l.toDate).getTime() - dayStart(l.fromDate).getTime();
    const days = half ? 0.5 : Math.max(0, Math.round(ms / 86400000)) + 1;
    await LeaveRequest.create({
      subjectType: "ambulance_staff",
      ambulanceStaffId: l.staffId,
      leaveTypeName: l.type,
      fromDate: l.fromDate,
      toDate: l.toDate,
      days,
      halfDay: half,
      reason: l.reason,
      attachmentUrl: l.attachmentUrl,
      status: statusMap[l.status] || "pending",
      createdAt: l.createdAt,
    } as any);
    created++;
  }

  console.log(`\nDone — migrated ${created}, skipped ${skipped}.`);
  console.log("Legacy StaffLeave rows are left intact (read-only) as a backup.");
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
