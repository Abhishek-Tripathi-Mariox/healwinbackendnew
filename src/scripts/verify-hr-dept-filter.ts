/**
 * The HR dashboard's department filter must scope every number it shows —
 * headcount, active, present today, on leave today and pending leave — to that
 * department's employees, and the department breakdown must stay unscoped so
 * there is still a way back out.
 *
 * Usage: npm run verify:hr-dept-filter
 */
import mongoose from "mongoose";
import config from "../config";
import { summary } from "../controllers/admin/hr-dashboard.controller";
import HrEmployee from "../models/hr-employee.model";
import Department from "../models/department.model";
import { PERMISSIONS } from "../models/role.model";
import Attendance from "../models/attendance.model";
import { Types } from "mongoose";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};

const call = async (departmentId?: string) => {
  const req: any = {
    query: departmentId ? { departmentId } : {},
    admin: { permissions: [PERMISSIONS.LEAVE_VIEW, PERMISSIONS.PAYROLL_VIEW] },
  };
  await summary(req, {} as any, (() => undefined) as any);
  return req.rData;
};

const TAG = "VERIFY-DEPT";

const run = async () => {
  await mongoose.connect(config.database.url);

  // Seed a department with staff, so the scoping path is genuinely exercised
  // rather than reported as passing because no department has anyone in it.
  await HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await Department.deleteMany({ name: `${TAG} Ward` });
  const seeded: any = await Department.create({ name: `${TAG} Ward` });
  const admin = new Types.ObjectId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seededIds: any[] = [];
  for (let i = 0; i < 3; i++) {
    const e: any = await HrEmployee.create({
      fullName: `${TAG} Nurse ${i}`,
      employeeCode: `${TAG}-${i}`,
      joiningDate: new Date(2024, 0, 1),
      status: i === 2 ? "inactive" : "active",
      departmentId: seeded._id,
      isDeleted: false,
      createdByAdminId: admin,
    });
    seededIds.push(e._id);
  }
  // One of them present today, to check the attendance counts are scoped too.
  await Attendance.create({
    employeeId: seededIds[0],
    subjectType: "hr_employee",
    date: today,
    status: "present",
  });

  const all = await call();
  console.log(`\n  unscoped: headcount=${all.headcount}, active=${all.activeCount}`);

  const departments = await Department.find({}).select("name").lean();
  let checked = 0;

  for (const d of departments as any[]) {
    const expected = await HrEmployee.countDocuments({
      isDeleted: false,
      departmentId: d._id,
    });
    if (!expected) continue;
    const scoped = await call(String(d._id));
    ok(`"${d.name}" headcount matches`, scoped.headcount === expected,
      `dashboard=${scoped.headcount} db=${expected}`);
    ok(`"${d.name}" breakdown still lists every department`,
      scoped.byDepartment.length === all.byDepartment.length,
      `${scoped.byDepartment.length} vs ${all.byDepartment.length}`);
    checked++;
  }

  // The "Unassigned" group the breakdown reports.
  const noneExpected = await HrEmployee.countDocuments({
    isDeleted: false,
    departmentId: null,
  });
  const none = await call("none");
  ok("Unassigned headcount matches", none.headcount === noneExpected,
    `dashboard=${none.headcount} db=${noneExpected}`);

  ok("scoped counts never exceed the unscoped total", none.headcount <= all.headcount);
  // The summary now returns its filters under `filters`, so the screen can
  // show what it is scoped to.
  ok("the filter is echoed back so the screen can show it",
    none.filters?.departmentId === "none", JSON.stringify(none.filters));

  // The seeded department, where the expected numbers are known exactly.
  const s = await call(String(seeded._id));
  ok("seeded department headcount is 3", s.headcount === 3, String(s.headcount));
  ok("only the 2 active ones count as active", s.activeCount === 2, String(s.activeCount));
  ok("present-today is scoped to the department", s.presentToday === 1, String(s.presentToday));
  ok(
    "an unrelated department does not see them",
    (await call("none")).headcount === noneExpected,
  );
  ok("the department appears in the unscoped breakdown",
    all.byDepartment.some((d: any) => d.name === `${TAG} Ward` && d.count === 3));

  await HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await Attendance.deleteMany({ employeeId: { $in: seededIds } });
  await Department.deleteMany({ name: `${TAG} Ward` });
  await mongoose.disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
