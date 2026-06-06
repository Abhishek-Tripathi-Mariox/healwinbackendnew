/**
 * Lists every AmbulanceStaff that is currently on duty (isOnline=true)
 * and reports whether they're actually linked to an ambulance — that's
 * the silent gotcha where `updateLocation` succeeds at the staff level
 * but writes to no ambulance because there's no `assignedDriverId` link.
 *
 * Run: cd backend && npx ts-node src/scripts/check-on-duty-staff.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import AmbulanceStaff from "../models/ambulance-staff.model";
import Ambulance from "../models/ambulance.model";

const ageStr = (d?: Date | null) => {
  if (!d) return "never";
  const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
};

const run = async () => {
  await mongoose.connect(config.database.url);

  const onDuty = await AmbulanceStaff.find({ isOnline: true })
    .select("fullName mobileNumber role isOnline isDutyOn lastSeenAt")
    .lean();

  console.log(`\n${onDuty.length} staff currently on duty (isOnline=true)\n`);

  for (const s of onDuty as any[]) {
    const linkedAsDriver = await Ambulance.findOne({
      assignedDriverId: s._id,
    }).lean();
    const linkedAsAttendant = await Ambulance.findOne({
      assignedAttendantId: s._id,
    }).lean();
    const link = linkedAsDriver
      ? `driver of ${linkedAsDriver.registrationNumber} (last loc ${ageStr(linkedAsDriver.lastLocationAt)})`
      : linkedAsAttendant
        ? `attendant of ${linkedAsAttendant.registrationNumber}`
        : "NOT linked to any ambulance — updateLocation calls are silently no-op";

    console.log(
      `${s.role.padEnd(9)}  ${s.fullName.padEnd(18)}  ${s.mobileNumber}  last seen ${ageStr(s.lastSeenAt)}`,
    );
    console.log(`           → ${link}`);
  }

  console.log("");
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
