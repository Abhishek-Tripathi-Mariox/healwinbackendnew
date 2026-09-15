/**
 * Every dashboard widget must agree with the database it claims to summarise,
 * and must honour the filters.
 *
 * Usage: npm run verify:hr-dashboard
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";
import Department from "../models/department.model";
import { summary } from "../controllers/admin/hr-dashboard.controller";
import { PERMISSIONS } from "../models/role.model";

const TAG = "VERIFY-DASH";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const call = async (query: any = {}) => {
  const req: any = {
    query,
    admin: { permissions: [PERMISSIONS.LEAVE_VIEW, PERMISSIONS.PAYROLL_VIEW] },
  };
  await summary(req, {} as any, (() => undefined) as any);
  return req.rData;
};

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const cleanup = async () => {
  const emps = await HrEmployee.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  await Attendance.deleteMany({ employeeId: { $in: emps.map((e: any) => e._id) } });
  await HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await Department.deleteMany({ name: `${TAG} Ward` });
};

const run = async () => {
  await mongoose.connect(config.database.url);
  await cleanup();

  const dept: any = await Department.create({ name: `${TAG} Ward` });
  const admin = new Types.ObjectId();
  const now = new Date();

  const mk = (n: number, over: any = {}) =>
    HrEmployee.create({
      employeeCode: `${TAG}-${n}`,
      fullName: `${TAG} Person ${n}`,
      joiningDate: new Date(2024, 0, 1),
      status: "active",
      isDeleted: false,
      departmentId: dept._id,
      createdByAdminId: admin,
      ...over,
    });

  // 5 in the ward: 2 present, 1 absent, 1 on leave, 1 unmarked.
  const people: any[] = [];
  for (let i = 0; i < 5; i++) people.push(await mk(i, { gender: i < 3 ? "female" : "male" }));
  // One with a birthday today, one with a work anniversary today.
  await mk(5, { dob: new Date(1990, now.getMonth(), now.getDate()), gender: "female" });
  await mk(6, { joiningDate: new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()) });

  const att = (emp: any, status: string, extra: any = {}) =>
    Attendance.create({
      employeeId: emp._id,
      subjectType: "hr_employee",
      date: today(),
      status,
      ...extra,
    });
  await att(people[0], "present", { isLate: true });
  await att(people[1], "present", { checkInWithinGeofence: false });
  await att(people[2], "absent");
  await att(people[3], "leave");

  section("Today");
  const d = await call({ departmentId: String(dept._id) });
  ok("present counts both present rows", d.today.present === 2, String(d.today.present));
  ok("absent is counted", d.today.absent === 1, String(d.today.absent));
  ok("on leave is counted", d.today.onLeave === 1, String(d.today.onLeave));
  ok("late arrivals are flagged separately", d.today.late >= 1, String(d.today.late));
  ok("off-site punches are flagged", d.today.offSite >= 1, String(d.today.offSite));
  ok("unmarked is headcount minus marked", d.today.notMarked === d.activeCount - d.today.marked,
    `${d.today.notMarked} vs ${d.activeCount}-${d.today.marked}`);

  section("Headcount and filters");
  ok("headcount matches the department", d.headcount === 7, String(d.headcount));
  const all = await call();
  ok("unfiltered headcount is larger", all.headcount > d.headcount, `${all.headcount} vs ${d.headcount}`);
  ok("the filter is echoed back", d.filters.departmentId === String(dept._id));
  const wrongDept = await call({ departmentId: String(new Types.ObjectId()) });
  ok("an empty department shows nothing", wrongDept.headcount === 0, String(wrongDept.headcount));
  ok("and its today counts are zero too", wrongDept.today.present === 0, String(wrongDept.today.present));

  section("Breakdowns");
  const ward = d.breakdown.byDepartment.find((r: any) => r.name === `${TAG} Ward`);
  ok("department breakdown counts the ward", ward?.count === 7, JSON.stringify(ward));
  const female = d.breakdown.byGender.find((r: any) => r.name === "female");
  ok("gender split is reported", female?.count === 4, JSON.stringify(d.breakdown.byGender));
  ok("designation breakdown is present", Array.isArray(d.breakdown.byDesignation));
  ok("employment type breakdown is present", Array.isArray(d.breakdown.byEmploymentType));
  ok("category breakdown is present", Array.isArray(d.breakdown.byCategory));

  section("Celebrations");
  ok("today's birthday is listed",
    d.celebrations.birthdays.some((b: any) => b.fullName === `${TAG} Person 5`),
    JSON.stringify(d.celebrations.birthdays.map((b: any) => b.fullName)));
  const anniv = d.celebrations.anniversaries.find((a: any) => a.fullName === `${TAG} Person 6`);
  ok("today's work anniversary is listed", !!anniv, JSON.stringify(d.celebrations.anniversaries));
  ok("with the number of years", anniv?.years === 3, String(anniv?.years));
  ok("someone who joined today is not an anniversary",
    !d.celebrations.anniversaries.some((a: any) => a.years === 0));

  section("Movement");
  ok("joiners and exits are reported", typeof d.movement.joiners === "number" && typeof d.movement.exits === "number");
  ok("attrition is a percentage", typeof d.movement.attritionPercent === "number");

  section("Trend");
  ok("seven days are returned", d.trend.length === 7, String(d.trend.length));
  ok("the last point is today",
    d.trend[6].date === today().toISOString().slice(0, 10), d.trend[6].date);
  ok("today's present count matches the card", d.trend[6].present === d.today.present,
    `${d.trend[6].present} vs ${d.today.present}`);

  section("Pending work");
  ok("pending approvals are grouped", typeof d.pending.leaveRequests === "number" || d.pending.leaveRequests === null);
  ok("regularizations are counted", typeof d.pending.regularizations === "number");

  section("Permissions still bite");
  const limited: any = { query: { departmentId: String(dept._id) }, admin: { permissions: [] } };
  await summary(limited, {} as any, (() => undefined) as any);
  ok("no leave counts without LEAVE_VIEW", limited.rData.pendingLeaves === null);
  ok("no payroll without PAYROLL_VIEW", limited.rData.latestRun === null);

  await cleanup();
  await mongoose.disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
