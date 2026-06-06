/* eslint-disable no-console */
/**
 * Populates the ambulance dispatch domain with realistic dev data:
 *   • 4 service providers across 4 metros
 *   • 3-4 ambulances per provider (mix of BLS / ALS / ICU / PTV)
 *   • 4 drivers + 3 attendants per provider
 *   • ~80% of ambulances pre-assigned to a driver + attendant pair so the
 *     admin "Ambulances" page shows fleet utilisation, and the rest left
 *     unassigned so the assignment flow has something to do
 *
 * Run with:
 *   npm run seed:fleet
 *
 * Idempotent — re-running upserts on natural keys (provider name,
 * ambulance registration, staff mobile). Admin / State / District are
 * auto-resolved (or created) so you don't need to look up ObjectIds.
 *
 * Override behaviour with env vars if needed:
 *   SEED_ADMIN_EMAIL   defaults to admin@healwin.in
 *   SEED_RESET=1       wipes providers/ambulances/staff before re-seeding
 */
import mongoose from "mongoose";
import connectDB from "../models";
import AmbulanceServiceProvider from "../models/ambulance-service-provider.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import Shift from "../models/shift.model";
import { Admin } from "../models/admin.model";
import State from "../models/state.model";
import District from "../models/district.model";

type Loc = { lat: number; lng: number };

interface ProviderSeed {
  name: string;
  contactPersonName: string;
  phone: string;
  email: string;
  address: string;
  stateCode: string;
  stateName: string;
  districtName: string;
  hub: Loc;
}

const PROVIDERS: ProviderSeed[] = [
  {
    name: "Apollo Rapid Response",
    contactPersonName: "Rohan Mehta",
    phone: "9810045001",
    email: "ops@apollo-rapid.example",
    address: "Plot 12, Sector 26, Noida",
    stateCode: "DL",
    stateName: "Delhi",
    districtName: "New Delhi",
    hub: { lat: 28.6139, lng: 77.209 },
  },
  {
    name: "MedLife Ambulance Services",
    contactPersonName: "Priya Nair",
    phone: "9820045002",
    email: "ops@medlife-amb.example",
    address: "Andheri West, Mumbai",
    stateCode: "MH",
    stateName: "Maharashtra",
    districtName: "Mumbai",
    hub: { lat: 19.076, lng: 72.8777 },
  },
  {
    name: "CareFirst Critical Care",
    contactPersonName: "Arjun Reddy",
    phone: "9844045003",
    email: "ops@carefirst.example",
    address: "Indiranagar, Bengaluru",
    stateCode: "KA",
    stateName: "Karnataka",
    districtName: "Bengaluru",
    hub: { lat: 12.9716, lng: 77.5946 },
  },
  {
    name: "Chennai Health Express",
    contactPersonName: "Lakshmi Iyer",
    phone: "9840045004",
    email: "ops@chennai-health.example",
    address: "T. Nagar, Chennai",
    stateCode: "TN",
    stateName: "Tamil Nadu",
    districtName: "Chennai",
    hub: { lat: 13.0827, lng: 80.2707 },
  },
];

// 4 drivers + 3 attendants per provider. Distinct, valid-Indian-mobile
// numbers (must start with 6-9 per the AmbulanceStaff schema regex).
const STAFF_PER_PROVIDER = [
  { role: "driver" as const, names: ["Suresh Kumar", "Ramesh Patil", "Vikas Singh", "Anil Verma"] },
  { role: "attendant" as const, names: ["Deepa Sharma", "Kiran Joshi", "Pooja Bhatt"] },
];

// 4 ambulances per provider — mix of types so the admin filter exercises.
const AMBULANCES_PER_PROVIDER: { type: "BLS" | "ALS" | "ICU" | "PTV"; equipment: string[] }[] = [
  { type: "BLS", equipment: ["OXYGEN", "FIRST_AID"] },
  { type: "ALS", equipment: ["OXYGEN", "DEFIBRILLATOR", "VENTILATOR"] },
  { type: "ICU", equipment: ["VENTILATOR", "MULTIPARA_MONITOR", "INFUSION_PUMP"] },
  { type: "PTV", equipment: ["STRETCHER", "WHEELCHAIR_LIFT"] },
];

// Random small offset so ambulances within a provider don't all sit on the
// same coordinate — looks more realistic on a map.
const jitter = (base: Loc, idx: number): Loc => ({
  lat: base.lat + (idx % 2 === 0 ? 1 : -1) * 0.01 * (idx + 1),
  lng: base.lng + (idx % 2 === 0 ? -1 : 1) * 0.012 * (idx + 1),
});

async function resolveAdminId(): Promise<mongoose.Types.ObjectId> {
  if (process.env.SEED_ADMIN_ID) {
    return new mongoose.Types.ObjectId(process.env.SEED_ADMIN_ID);
  }
  const email = process.env.SEED_ADMIN_EMAIL;
  // Prefer an explicit email; otherwise fall back to the first active admin
  // in the DB. Admin creation has too many required-relationship fields
  // (roleId etc) to safely synthesise from a seed.
  const query = email ? { email, isDeleted: { $ne: true } } : { isDeleted: { $ne: true } };
  const admin = await Admin.findOne(query).sort({ createdAt: 1 }).lean();
  if (!admin) {
    throw new Error(
      "No admin found in DB. Run `npm run seed` first to create the base admin, " +
        "or pass SEED_ADMIN_ID=<existing-admin-id> when running this seed."
    );
  }
  return admin._id as mongoose.Types.ObjectId;
}

async function resolveStateDistrict(p: ProviderSeed) {
  const state = await State.findOneAndUpdate(
    { code: p.stateCode },
    {
      $setOnInsert: {
        name: p.stateName,
        code: p.stateCode,
        isActive: true,
        sortOrder: 0,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  const district = await District.findOneAndUpdate(
    { name: p.districtName, state: state._id },
    {
      $setOnInsert: {
        name: p.districtName,
        state: state._id,
        isActive: true,
        sortOrder: 0,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  return { stateId: state._id, districtId: district._id };
}

async function main() {
  await connectDB();

  if (process.env.SEED_RESET === "1") {
    console.log("⚠️  SEED_RESET=1 — wiping ambulance fleet data");
    await Promise.all([
      Ambulance.deleteMany({}),
      AmbulanceStaff.deleteMany({}),
      AmbulanceServiceProvider.deleteMany({}),
    ]);
  }

  const adminId = await resolveAdminId();
  console.log("Using admin:", adminId.toString());

  let providerCount = 0;
  let staffCount = 0;
  let ambulanceCount = 0;
  let assignmentCount = 0;

  for (let pi = 0; pi < PROVIDERS.length; pi++) {
    const p = PROVIDERS[pi];
    const { stateId, districtId } = await resolveStateDistrict(p);

    const provider = await AmbulanceServiceProvider.findOneAndUpdate(
      { name: p.name },
      {
        name: p.name,
        contactPersonName: p.contactPersonName,
        phone: p.phone,
        email: p.email,
        address: p.address,
        state: stateId,
        district: districtId,
        isActive: true,
        createdByAdminId: adminId,
      },
      { upsert: true, returnDocument: "after" },
    );
    providerCount++;

    // Build staff for this provider. Mobile pool: 98xxxYYYZZ where xxx
    // encodes provider index and YY encodes staff slot — keeps every
    // number globally unique and valid under the [6-9]\d{9} regex.
    const drivers: mongoose.Types.ObjectId[] = [];
    const attendants: mongoose.Types.ObjectId[] = [];

    for (const group of STAFF_PER_PROVIDER) {
      for (let si = 0; si < group.names.length; si++) {
        // Encode (provider, role, slot) into the mobile number so every
        // seeded staff has a globally unique, regex-valid 10-digit number.
        const safeMobile = `9${(
          800000000 +
          pi * 1000 +
          (group.role === "driver" ? 100 : 500) +
          si
        )
          .toString()
          .padStart(9, "0")}`;
        const staff = await AmbulanceStaff.findOneAndUpdate(
          { mobileNumber: safeMobile, countryCode: "+91" },
          {
            providerId: provider._id,
            role: group.role,
            mobileNumber: safeMobile,
            countryCode: "+91",
            fullName: group.names[si],
            email: `${group.names[si].toLowerCase().replace(/\s+/g, ".")}.${pi}@${p.email.split("@")[1]}`,
            gender: si % 2 === 0 ? "Male" : "Female",
            licenseNumber:
              group.role === "driver"
                ? `DL-${p.stateCode}-${pi}${si}-${Date.now().toString().slice(-4)}`
                : undefined,
            certifications:
              group.role === "attendant" ? ["EMT-Basic", "CPR-AHA"] : undefined,
            isActive: true,
            isDeleted: false,
            isOnline: si === 0, // one driver/attendant per provider shown online
            isDutyOn: si === 0,
            createdByAdminId: adminId,
          },
          { upsert: true, returnDocument: "after" },
        );
        staffCount++;
        if (group.role === "driver") drivers.push(staff._id as mongoose.Types.ObjectId);
        else attendants.push(staff._id as mongoose.Types.ObjectId);
      }
    }

    // Build ambulances. Assign driver[i] + attendant[i] when both exist;
    // leave the last ambulance unassigned for variety.
    for (let ai = 0; ai < AMBULANCES_PER_PROVIDER.length; ai++) {
      const ambSpec = AMBULANCES_PER_PROVIDER[ai];
      const loc = jitter(p.hub, ai);
      const assignDriver = ai < drivers.length - 1 ? drivers[ai] : null;
      const assignAttendant = ai < attendants.length ? attendants[ai] : null;

      const regNumber = `${p.stateCode}${(10 + pi).toString().padStart(2, "0")}AMB${(1000 + ai).toString()}`;

      const amb = await Ambulance.findOneAndUpdate(
        { registrationNumber: regNumber },
        {
          providerId: provider._id,
          registrationNumber: regNumber,
          ambulanceType: ambSpec.type,
          equipment: ambSpec.equipment,
          fuelType: "Diesel",
          // assignedDriverId/assignedAttendantId are now a cache populated
          // by the Shift state machine. Seed only writes them for the
          // first ambulance per provider so the "available" status has a
          // matching crew until the state machine catches up on first
          // boot.
          assignedDriverId: ai === 0 ? assignDriver : null,
          assignedAttendantId: ai === 0 ? assignAttendant : null,
          currentLocation: { type: "Point", coordinates: [loc.lng, loc.lat] },
          lastLocationAt: new Date(),
          status: ai === 0 ? "available" : "offline",
          isActive: true,
        },
        { upsert: true, returnDocument: "after" },
      );
      ambulanceCount++;
      if (assignDriver) assignmentCount++;

      // Seed a roster around each ambulance:
      //   - One "active right now" 8-hour shift (driver + attendant) so
      //     the dispatcher has something to dispatch immediately and the
      //     driver app shows a clock-in card on launch.
      //   - One scheduled shift starting in 8 hours so the "next shift"
      //     surface in the driver app isn't empty after the active one
      //     ends.
      //   - One completed shift from yesterday for the history view.
      if (assignDriver && assignAttendant) {
        const now = new Date();
        const eightHoursMs = 8 * 60 * 60 * 1000;
        const todayStart = new Date(now.getTime() - eightHoursMs / 2);
        const todayEnd = new Date(todayStart.getTime() + eightHoursMs);
        const tomorrowStart = new Date(todayEnd.getTime());
        const tomorrowEnd = new Date(tomorrowStart.getTime() + eightHoursMs);
        const yesterdayEnd = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const yesterdayStart = new Date(yesterdayEnd.getTime() - eightHoursMs);

        const seedShifts = [
          { staff: assignDriver, role: "driver", start: todayStart, end: todayEnd, status: "scheduled" },
          { staff: assignAttendant, role: "attendant", start: todayStart, end: todayEnd, status: "scheduled" },
          { staff: drivers[(ai + 1) % drivers.length], role: "driver", start: tomorrowStart, end: tomorrowEnd, status: "scheduled" },
          { staff: attendants[(ai + 1) % attendants.length], role: "attendant", start: tomorrowStart, end: tomorrowEnd, status: "scheduled" },
          { staff: assignDriver, role: "driver", start: yesterdayStart, end: yesterdayEnd, status: "completed" },
        ] as const;

        for (const s of seedShifts) {
          // Idempotent insert: skip if a shift with the same composite key
          // exists.
          const exists = await Shift.exists({
            ambulanceId: amb!._id,
            staffId: s.staff,
            startAt: s.start,
          });
          if (exists) continue;
          await Shift.create({
            providerId: provider._id,
            ambulanceId: amb!._id,
            staffId: s.staff,
            role: s.role,
            startAt: s.start,
            endAt: s.end,
            status: s.status,
            clockInAt: s.status === "completed" ? s.start : undefined,
            clockOutAt: s.status === "completed" ? s.end : undefined,
            createdByAdminId: adminId,
          });
        }
      }
    }
  }

  const shiftCount = await Shift.countDocuments();
  console.log("\n✅ Fleet seed complete:");
  console.log(`   providers   : ${providerCount}`);
  console.log(`   ambulances  : ${ambulanceCount}`);
  console.log(`   staff       : ${staffCount}`);
  console.log(`   assigned    : ${assignmentCount} (initial cache)`);
  console.log(`   shifts      : ${shiftCount} total in roster`);
  console.log("\nLogin to admin and check:");
  console.log("   /ambulance-providers  →  4 providers");
  console.log("   /ambulances           →  16 ambulances across 4 cities");
  console.log("   /ambulance-staff      →  28 staff (16 drivers + 12 attendants)");
  console.log("   /shifts               →  populated roster");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Fleet seed failed:", e);
  process.exit(1);
});
