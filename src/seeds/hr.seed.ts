/**
 * HR module seed — default leave types, current-year holidays and a demo HR
 * login so the panel can be exercised immediately.
 *
 * Usage: npm run seed:hr   (run `npm run seed:roles` first so roles exist)
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import config from "../config";
import { Role, DEFAULT_ROLES } from "../models/role.model";
import { Admin } from "../models/admin.model";
import { LeaveType } from "../models/leave-type.model";
import { Holiday } from "../models/holiday.model";

const HR_EMAIL = "hr@healwin.com";
const HR_PASSWORD = "Hr@12345";

const LEAVE_TYPES = [
  { name: "Casual Leave", code: "CL", annualQuota: 12, isPaid: true, color: "#3b82f6" },
  { name: "Sick Leave", code: "SL", annualQuota: 12, isPaid: true, color: "#ef4444" },
  { name: "Earned Leave", code: "EL", annualQuota: 15, isPaid: true, color: "#10b981" },
  { name: "Loss of Pay", code: "LOP", annualQuota: 0, isPaid: false, color: "#6b7280" },
];

const seedHr = async () => {
  try {
    await mongoose.connect(config.database.url);
    console.log("✅ Connected to MongoDB");

    // Ensure HR Manager role exists (idempotent with seed-roles).
    let hrRole = await Role.findOne({ name: DEFAULT_ROLES.HR_MANAGER.name });
    if (!hrRole) {
      hrRole = await Role.create(DEFAULT_ROLES.HR_MANAGER);
      console.log("  ✅ Created role: HR Manager");
    } else {
      // Keep permissions in sync with the source of truth.
      hrRole.permissions = DEFAULT_ROLES.HR_MANAGER.permissions as string[];
      await hrRole.save();
      console.log("  ⏭️  HR Manager role exists (permissions synced)");
    }

    // Leave types.
    for (const lt of LEAVE_TYPES) {
      await LeaveType.findOneAndUpdate({ code: lt.code }, lt, { upsert: true });
    }
    console.log(`  ✅ Seeded ${LEAVE_TYPES.length} leave types`);

    // A few sample public holidays for the current year.
    const year = new Date().getFullYear();
    const holidays = [
      { name: "New Year's Day", date: new Date(year, 0, 1) },
      { name: "Republic Day", date: new Date(year, 0, 26) },
      { name: "Independence Day", date: new Date(year, 7, 15) },
      { name: "Gandhi Jayanti", date: new Date(year, 9, 2) },
      { name: "Christmas", date: new Date(year, 11, 25) },
    ];
    for (const h of holidays) {
      h.date.setHours(0, 0, 0, 0);
      await Holiday.findOneAndUpdate(
        { name: h.name, year },
        { name: h.name, date: h.date, year, type: "public", isActive: true },
        { upsert: true },
      );
    }
    console.log(`  ✅ Seeded ${holidays.length} holidays for ${year}`);

    // Demo HR login.
    const existing = await Admin.findOne({ email: HR_EMAIL });
    if (existing) {
      console.log(`  ⏭️  HR user already exists: ${HR_EMAIL}`);
    } else {
      const hashedPassword = await bcrypt.hash(HR_PASSWORD, 12);
      await Admin.create({
        fullName: "HR Manager",
        email: HR_EMAIL,
        phone: "+919888888888",
        password: hashedPassword,
        roleId: hrRole._id,
        roleName: hrRole.name,
        permissions: hrRole.permissions,
        isActive: true,
        isDeleted: false,
      });
      console.log("  ✅ Created HR user");
      console.log(`     Email: ${HR_EMAIL}`);
      console.log(`     Password: ${HR_PASSWORD}`);
      console.log("     ⚠️  Change the password after first login!");
    }

    console.log("\n🎉 HR seed complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ HR seed failed:", err);
    process.exit(1);
  }
};

seedHr();
