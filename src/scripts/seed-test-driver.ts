/* eslint-disable no-console */
/**
 * Seeds one ambulance provider, driver (9999999001), attendant (9999999002),
 * and one ambulance — re-using the first Admin/State/District it finds.
 *
 * Usage:
 *   cd backend && npx ts-node src/scripts/seed-test-driver.ts
 */
import mongoose from "mongoose";
import connectDB from "../models";
import { Admin } from "../models/admin.model";
import { State } from "../models/state.model";
import { District } from "../models/district.model";
import AmbulanceServiceProvider from "../models/ambulance-service-provider.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";

async function main() {
  await connectDB();

  const admin = await Admin.findOne().lean();
  const state = await State.findOne().lean();
  const district = await District.findOne().lean();

  if (!admin || !state || !district) {
    console.error("Need at least one Admin, State, and District in the DB.");
    console.error({
      admin: !!admin,
      state: !!state,
      district: !!district,
    });
    process.exit(1);
  }

  const provider = await AmbulanceServiceProvider.findOneAndUpdate(
    { name: "DevAmb Co." },
    {
      name: "DevAmb Co.",
      contactPersonName: "Ops Lead",
      phone: "9876543210",
      email: "ops@devamb.example",
      state: state._id,
      district: district._id,
      isActive: true,
      createdByAdminId: admin._id,
    },
    { upsert: true, returnDocument: "after" },
  );

  const driver = await AmbulanceStaff.findOneAndUpdate(
    { mobileNumber: "9999999001", countryCode: "+91" },
    {
      providerId: provider._id,
      role: "driver",
      mobileNumber: "9999999001",
      countryCode: "+91",
      fullName: "Test Driver",
      licenseNumber: "DL-DEV-1",
      isActive: true,
      isDeleted: false,
      createdByAdminId: admin._id,
    },
    { upsert: true, returnDocument: "after" },
  );

  const attendant = await AmbulanceStaff.findOneAndUpdate(
    { mobileNumber: "9999999002", countryCode: "+91" },
    {
      providerId: provider._id,
      role: "attendant",
      mobileNumber: "9999999002",
      countryCode: "+91",
      fullName: "Test Attendant",
      certifications: ["EMT-Basic"],
      isActive: true,
      isDeleted: false,
      createdByAdminId: admin._id,
    },
    { upsert: true, returnDocument: "after" },
  );

  const ambulance = await Ambulance.findOneAndUpdate(
    { registrationNumber: "DLDEV1234" },
    {
      providerId: provider._id,
      registrationNumber: "DLDEV1234",
      ambulanceType: "BLS",
      equipment: ["OXYGEN", "DEFIBRILLATOR"],
      fuelType: "Diesel",
      assignedDriverId: driver._id,
      assignedAttendantId: attendant._id,
      currentLocation: { type: "Point", coordinates: [77.2167, 28.6333] },
      lastLocationAt: new Date(),
      status: "offline",
      isActive: true,
    },
    { upsert: true, returnDocument: "after" },
  );

  console.log("Seed complete:");
  console.log({
    provider: provider._id.toString(),
    driver: driver._id.toString(),
    attendant: attendant._id.toString(),
    ambulance: ambulance._id.toString(),
    driverPhone: driver.mobileNumber,
    attendantPhone: attendant.mobileNumber,
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
