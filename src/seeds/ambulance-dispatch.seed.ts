/* eslint-disable no-console */
import mongoose from "mongoose";
import connectDB from "../models";
import AmbulanceServiceProvider from "../models/ambulance-service-provider.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";

async function main() {
  await connectDB();

  const ADMIN_ID = process.env.SEED_ADMIN_ID;
  const STATE_ID = process.env.SEED_STATE_ID;
  const DISTRICT_ID = process.env.SEED_DISTRICT_ID;
  if (!ADMIN_ID || !STATE_ID || !DISTRICT_ID) {
    throw new Error(
      "Set SEED_ADMIN_ID, SEED_STATE_ID, SEED_DISTRICT_ID env vars.",
    );
  }

  const provider = await AmbulanceServiceProvider.findOneAndUpdate(
    { name: "SeedAmbulance Co." },
    {
      name: "SeedAmbulance Co.",
      contactPersonName: "Ops Lead",
      phone: "9876543210",
      email: "ops@seedamb.example",
      state: STATE_ID,
      district: DISTRICT_ID,
      isActive: true,
      createdByAdminId: ADMIN_ID,
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
      licenseNumber: "DL-TEST-1",
      isActive: true,
      createdByAdminId: ADMIN_ID,
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
      createdByAdminId: ADMIN_ID,
    },
    { upsert: true, returnDocument: "after" },
  );

  const amb = await Ambulance.findOneAndUpdate(
    { registrationNumber: "DL01TEST1234" },
    {
      providerId: provider._id,
      registrationNumber: "DL01TEST1234",
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

  console.log("Seed complete:", {
    provider: provider!._id.toString(),
    driver: driver!._id.toString(),
    attendant: attendant!._id.toString(),
    ambulance: amb!._id.toString(),
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
