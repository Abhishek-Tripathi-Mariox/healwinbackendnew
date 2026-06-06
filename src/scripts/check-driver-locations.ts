/**
 * One-off diagnostic: prints every ambulance's location-update state.
 * Run with:
 *   cd backend && npx ts-node src/scripts/check-driver-locations.ts
 *
 * For each ambulance shows:
 *   - registration + status (available / on_dispatch / offline / maintenance)
 *   - assigned driver name + isOnline flag (i.e. duty toggle state)
 *   - assigned attendant name + isOnline flag
 *   - last location ping (age in seconds) and coordinates
 *   - verdict: would this vehicle show in the dispatch picker?
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import Ambulance from "../models/ambulance.model";
import "../models/ambulance-staff.model"; // register schema for populate

const STALE_MS = 5 * 60 * 1000;

const ageStr = (d?: Date | null) => {
  if (!d) return "never";
  const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
};

const run = async () => {
  await mongoose.connect(config.database.url);
  const ambs = await Ambulance.find({})
    .populate("assignedDriverId", "fullName mobileNumber isOnline isDutyOn")
    .populate("assignedAttendantId", "fullName mobileNumber isOnline isDutyOn")
    .lean();

  console.log(`\n${ambs.length} ambulance(s) total\n`);

  const staleCutoff = new Date(Date.now() - STALE_MS);
  let dispatchable = 0;

  for (const a of ambs as any[]) {
    const driver = a.assignedDriverId;
    const attendant = a.assignedAttendantId;
    const coords = a.currentLocation?.coordinates;

    const dispatchableNow =
      a.isActive &&
      a.status === "available" &&
      !!driver &&
      !!attendant &&
      driver.isOnline === true &&
      attendant.isOnline === true &&
      a.lastLocationAt &&
      new Date(a.lastLocationAt) >= staleCutoff;
    if (dispatchableNow) dispatchable++;

    console.log("=".repeat(60));
    console.log(
      `${a.registrationNumber || "(no reg)"}   status=${a.status}   active=${a.isActive}`,
    );
    console.log(
      `  driver:    ${driver ? `${driver.fullName} (${driver.mobileNumber}) online=${driver.isOnline} dutyOn=${driver.isDutyOn}` : "(unassigned)"}`,
    );
    console.log(
      `  attendant: ${attendant ? `${attendant.fullName} (${attendant.mobileNumber}) online=${attendant.isOnline} dutyOn=${attendant.isDutyOn}` : "(unassigned)"}`,
    );
    console.log(
      `  location:  ${
        coords ? `[${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}]` : "(none)"
      }  last ping ${ageStr(a.lastLocationAt)}`,
    );
    console.log(
      `  dispatchable: ${dispatchableNow ? "YES ✓" : "no"}${
        !dispatchableNow ? "  (" + reasons(a, driver, attendant, staleCutoff).join(", ") + ")" : ""
      }`,
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${dispatchable} / ${ambs.length} dispatchable`);
  await mongoose.disconnect();
};

const reasons = (
  a: any,
  driver: any,
  attendant: any,
  staleCutoff: Date,
): string[] => {
  const out: string[] = [];
  if (!a.isActive) out.push("ambulance inactive");
  if (a.status !== "available") out.push(`status=${a.status}`);
  if (!driver) out.push("no driver assigned");
  if (!attendant) out.push("no attendant assigned");
  if (driver && !driver.isOnline) out.push("driver off duty");
  if (attendant && !attendant.isOnline) out.push("attendant off duty");
  if (!a.lastLocationAt) out.push("no location ever received");
  else if (new Date(a.lastLocationAt) < staleCutoff) {
    out.push(`location stale (${ageStr(a.lastLocationAt)})`);
  }
  return out;
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
