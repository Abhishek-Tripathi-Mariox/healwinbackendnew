/**
 * Promotes an AmbulanceStaff record from attendant → driver and links
 * them to a specified (or first available) ambulance as `assignedDriverId`.
 *
 * Usage:
 *   npx ts-node src/scripts/promote-to-driver.ts <mobileNumber> [ambulanceReg]
 *
 * Example:
 *   npx ts-node src/scripts/promote-to-driver.ts 9800003502
 *   npx ts-node src/scripts/promote-to-driver.ts 9800003502 TN13AMB1002
 *
 * Notes:
 *   - The staff is moved from hospitalId → providerId (mutual exclusion).
 *     A providerId is required; we pick the first active provider so the
 *     staff has somewhere to belong.
 *   - If the ambulance already has a different driver assigned, that
 *     driver is bumped (their `assignedDriverId` link is broken — they
 *     stay in the system but unassigned).
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import AmbulanceStaff from "../models/ambulance-staff.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceServiceProvider from "../models/ambulance-service-provider.model";

const run = async () => {
  const [mobile, reg] = process.argv.slice(2);
  if (!mobile) {
    console.error("usage: npx ts-node promote-to-driver.ts <mobile> [reg]");
    process.exit(1);
  }
  await mongoose.connect(config.database.url);

  const staff = await AmbulanceStaff.findOne({ mobileNumber: mobile });
  if (!staff) {
    console.error(`No staff with mobile ${mobile}`);
    process.exit(1);
  }
  console.log(
    `Found ${staff.fullName} (${staff.mobileNumber}) — current role: ${staff.role}`,
  );

  const provider = await AmbulanceServiceProvider.findOne({
    isActive: true,
  }).lean();
  if (!provider) {
    console.error("No active provider found. Create one in admin first.");
    process.exit(1);
  }

  const amb = reg
    ? await Ambulance.findOne({ registrationNumber: reg, isActive: true })
    : await Ambulance.findOne({ isActive: true });
  if (!amb) {
    console.error("No ambulance found.");
    process.exit(1);
  }

  staff.role = "driver";
  staff.providerId = provider._id;
  staff.hospitalId = null;
  await staff.save();

  // Unlink any previous driver of this ambulance, then assign this staff.
  if (amb.assignedDriverId && String(amb.assignedDriverId) !== String(staff._id)) {
    console.log(`  Replacing previous driver on ${amb.registrationNumber}`);
  }
  amb.assignedDriverId = staff._id;
  await amb.save();

  console.log(
    `✓ ${staff.fullName} is now driver of ${amb.registrationNumber}`,
  );
  console.log(`  Ambulance status: ${amb.status}`);
  console.log(`  Attendant: ${amb.assignedAttendantId ? "assigned" : "MISSING — assign one in admin or vehicle won't show in dispatch"}`);

  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
