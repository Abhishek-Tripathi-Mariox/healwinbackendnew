/**
 * One-time backfill: walk every active ambulance and re-derive its
 * `status` from current crew duty state. Needed once after deploying
 * the "either crew online → vehicle available" rule, because the rule
 * fires on duty-toggle events and pre-existing on-duty crew never
 * triggered a fresh toggle.
 *
 * Safe to re-run — idempotent. Skips on_dispatch / maintenance.
 *
 * Run: cd backend && npx ts-node src/scripts/reconcile-ambulance-status.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";

const run = async () => {
  await mongoose.connect(config.database.url);
  const ambs = await Ambulance.find({
    isActive: true,
    status: { $nin: ["on_dispatch", "maintenance"] },
  });

  let flippedToAvailable = 0;
  let flippedToOffline = 0;
  for (const a of ambs) {
    const driver = a.assignedDriverId
      ? await AmbulanceStaff.findById(a.assignedDriverId).select("isOnline")
      : null;
    const attendant = a.assignedAttendantId
      ? await AmbulanceStaff.findById(a.assignedAttendantId).select(
          "isOnline",
        )
      : null;
    const anyOnline = !!(driver?.isOnline || attendant?.isOnline);
    const target = anyOnline ? "available" : "offline";
    if (a.status !== target) {
      console.log(
        `  ${a.registrationNumber}: ${a.status} → ${target}  (driver=${driver?.isOnline ? "on" : "off"}, attendant=${attendant?.isOnline ? "on" : "off"})`,
      );
      a.status = target as typeof a.status;
      await a.save();
      if (target === "available") flippedToAvailable++;
      else flippedToOffline++;
    }
  }
  console.log(
    `\nReconciled ${ambs.length} ambulance(s): ${flippedToAvailable} → available, ${flippedToOffline} → offline.`,
  );
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
