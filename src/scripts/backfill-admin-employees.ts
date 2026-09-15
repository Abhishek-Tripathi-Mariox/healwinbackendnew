/**
 * Give every existing panel user an HR employee record.
 *
 * Creating a login now also creates the linked HR record, but anyone added
 * before that change has none — so they show on the roster as a bare login
 * that cannot be opened, has no department, and never reaches attendance or
 * payroll. This links them up.
 *
 * Existing employees with the same email are LINKED, not duplicated: creating
 * a second record would split that person's attendance and payroll in two.
 *
 * Safe to re-run; already-linked admins are skipped.
 *
 * Usage: npm run migrate:admin-employees [--dry]
 */
import mongoose from "mongoose";
import config from "../config";
import { Admin } from "../models/admin.model";
import HrEmployee from "../models/hr-employee.model";
import { ensureEmployeeForAdmin } from "../services/employee-link.service";

const dry = process.argv.includes("--dry");

const run = async () => {
  await mongoose.connect(config.database.url);

  const admins: any[] = await Admin.find({ isDeleted: { $ne: true } })
    .select("fullName email phone")
    .sort({ createdAt: 1 })
    .lean();

  const linked = new Set(
    (
      await HrEmployee.find({ isDeleted: false, linkedAdminId: { $ne: null } })
        .select("linkedAdminId")
        .lean()
    ).map((r: any) => String(r.linkedAdminId)),
  );

  let created = 0;
  let joined = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const a of admins) {
    if (linked.has(String(a._id))) {
      skipped++;
      continue;
    }
    if (dry) {
      const byEmail = a.email
        ? await HrEmployee.findOne({
            email: String(a.email).toLowerCase(),
            isDeleted: false,
          })
            .select("employeeCode")
            .lean()
        : null;
      console.log(
        byEmail
          ? `  ~ ${a.fullName} would link to existing ${(byEmail as any).employeeCode}`
          : `  + ${a.fullName} would get a new employee record`,
      );
      created++;
      continue;
    }
    try {
      const res = await ensureEmployeeForAdmin(a);
      if (res?.created) {
        created++;
        console.log(`  + ${a.fullName} → ${res.employeeCode}`);
      } else if (res) {
        joined++;
        console.log(`  ~ ${a.fullName} linked to existing ${res.employeeCode}`);
      }
    } catch (err: any) {
      failures.push(`${a.fullName}: ${err?.message || err}`);
      console.log(`  ❌ ${a.fullName}: ${err?.message || err}`);
    }
  }

  await mongoose.disconnect();
  console.log(`\n${"─".repeat(56)}`);
  console.log(
    `  ${admins.length} panel users — ${created} ${dry ? "would be created" : "created"}, ${joined} linked to existing, ${skipped} already linked, ${failures.length} failed`,
  );
  if (!dry && (created || joined)) {
    console.log("  Their joining date is set to today — HR should correct it.");
  }
  console.log(`${"─".repeat(56)}\n`);
  process.exit(failures.length ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
