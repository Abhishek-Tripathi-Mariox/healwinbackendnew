/**
 * Payroll on a 16th-to-15th cycle.
 *
 * The property under test: a run named "September" must count attendance from
 * 16 September to 15 October — NOT 1–30 September. Getting this wrong pays the
 * wrong people the wrong amounts, silently, so it is checked against the real
 * handler and a real database.
 *
 * Test data is prefixed E2E-CYC and removed at the end.
 * Usage: npm run e2e:payroll-cycle
 */
import mongoose from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";
import { buildAttendanceSummary } from "../services/payroll.service";
import { payrollPeriod } from "../services/payroll-period";
import {
  setCycleStartDay,
  getCycleStartDay,
  resetCycleCache,
} from "../services/payroll-settings.service";
import PayrollSettings from "../models/payroll-settings.model";
import { Types } from "mongoose";

const TAG = "E2E-CYC";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 0, 0, 0, 0);

const cleanup = async () => {
  const emps = await HrEmployee.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  const ids = emps.map((e: any) => e._id);
  await Promise.all([
    Attendance.deleteMany({ employeeId: { $in: ids } }),
    HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — payroll cycle\n`);
  await cleanup();

  // Preserve whatever the org has configured; this test changes it.
  const savedSettings = await PayrollSettings.find({}).lean();

  const emp: any = await HrEmployee.create({
    fullName: `${TAG} Nurse`,
    employeeCode: `${TAG}-1`,
    email: `${TAG.toLowerCase()}@example.com`,
    phone: "9876500099",
    joiningDate: day(2024, 1, 1),
    status: "active",
    isDeleted: false,
    createdByAdminId: new Types.ObjectId(),
  });

  // Absences placed so the two calendars produce DIFFERENT totals — otherwise
  // the test passes on a coincidence (September and 16 Sep–15 Oct are both 30
  // days long, so equal counts prove nothing).
  //   10 Sep — inside calendar September, OUTSIDE the 16–15 period
  //   20 Sep — inside both
  //    5 Oct, 6 Oct — outside calendar September, INSIDE the 16–15 period
  // Expected: cycle sees 3 (20 Sep, 5 Oct, 6 Oct); calendar sees 2 (10, 20 Sep).
  const absences = [
    day(2026, 9, 10),
    day(2026, 9, 20),
    day(2026, 10, 5),
    day(2026, 10, 6),
  ];
  for (const d of absences) {
    await Attendance.create({
      employeeId: emp._id,
      subjectType: "hr_employee",
      date: d,
      status: "absent",
    });
  }

  section("Period boundaries");
  const p = payrollPeriod(9, 2026, 16);
  ok("September starts on the 16th", p.start.getDate() === 16 && p.start.getMonth() === 8);
  ok("September ends on 15 October", p.end.getDate() === 15 && p.end.getMonth() === 9);
  ok("period spans 30 days", p.totalDays === 30, String(p.totalDays));

  section("Attendance counted over the period, not the calendar month");
  const cyc = await buildAttendanceSummary(
    emp._id, 9, 2026, new Set(), "hr_employee",
    { joiningDate: emp.joiningDate }, 16,
  );
  ok("counts the 3 absences inside 16 Sep – 15 Oct", cyc.absentDays === 3, `absentDays=${cyc.absentDays}`);
  ok("proration denominator is the period length", cyc.totalDays === 30, String(cyc.totalDays));

  section("The same data on a calendar month gives a different answer");
  const cal = await buildAttendanceSummary(
    emp._id, 9, 2026, new Set(), "hr_employee",
    { joiningDate: emp.joiningDate }, 1,
  );
  ok("calendar month counts only the 2 September absences", cal.absentDays === 2, `absentDays=${cal.absentDays}`);
  ok(
    "the two calendars genuinely disagree, so the cycle is doing real work",
    cyc.absentDays !== cal.absentDays,
    `cycle=${cyc.absentDays} calendar=${cal.absentDays}`,
  );
  ok(
    "the 10 Sep absence is charged to the PREVIOUS run, not this one",
    // Under the 16–15 cycle, 10 Sep belongs to the August run.
    (await buildAttendanceSummary(
      emp._id, 8, 2026, new Set(), "hr_employee",
      { joiningDate: emp.joiningDate }, 16,
    )).absentDays === 1,
  );

  section("Setting round-trip");
  await setCycleStartDay(16);
  ok("saved cycle reads back", (await getCycleStartDay()) === 16);
  await setCycleStartDay(1);
  resetCycleCache();
  ok("changing it takes effect", (await getCycleStartDay()) === 1);

  // Restore.
  await PayrollSettings.deleteMany({});
  if (savedSettings.length) await PayrollSettings.insertMany(savedSettings);
  resetCycleCache();

  await cleanup();
  await mongoose.disconnect();
  console.log(`\n${"─".repeat(46)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) failures.forEach((f) => console.log(`   • ${f}`));
  console.log(`${"─".repeat(46)}\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥 crashed:", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
