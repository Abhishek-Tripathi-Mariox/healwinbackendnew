/**
 * Self-service punch in / punch out.
 *
 * The rules that matter: a punch writes the SAME attendance row HR and payroll
 * already read, it can only ever touch the caller's own record, hours are
 * computed from the shift, and a GPS problem never costs someone their day.
 *
 * Usage: npm run e2e:punch
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";
import { Admin } from "../models/admin.model";
import Role from "../models/role.model";
import WorkShift from "../models/work-shift.model";
import EmployeeShift from "../models/employee-shift.model";
import * as C from "../controllers/admin/my-attendance.controller";
import { markBulk, byDate } from "../controllers/admin/attendance.controller";
import { summary as hrSummary } from "../controllers/admin/hr-dashboard.controller";
import { PERMISSIONS } from "../models/role.model";

const TAG = "E2E-PUNCH";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const call = async (fn: any, req: any) => {
  const r: any = { params: {}, query: {}, body: {}, ...req };
  await fn(r, {} as any, (() => undefined) as any);
  return { data: r.rData, code: r.rCode, msg: r.msg };
};

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const cleanup = async () => {
  const emps = await HrEmployee.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  const ids = emps.map((e: any) => e._id);
  await Promise.all([
    Attendance.deleteMany({ employeeId: { $in: ids } }),
    EmployeeShift.deleteMany({ employeeId: { $in: ids } }),
    HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    Admin.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    WorkShift.deleteMany({ name: `${TAG} Day` }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — self-service punch\n`);
  await cleanup();

  const role: any = await Role.findOne({ isActive: true }).lean();
  const adminAcc: any = await Admin.create({
    fullName: `${TAG} Nurse`,
    email: `${TAG.toLowerCase()}@example.com`,
    password: "x".repeat(20),
    roleId: role._id,
    roleName: role.name,
    isActive: true,
  });
  const emp: any = await HrEmployee.create({
    employeeCode: `${TAG}-1`,
    fullName: `${TAG} Nurse`,
    email: `${TAG.toLowerCase()}@example.com`,
    joiningDate: new Date(2024, 0, 1),
    status: "active",
    isDeleted: false,
    linkedAdminId: adminAcc._id,
    createdByAdminId: new Types.ObjectId(),
  });

  // A 9-to-5 shift, so worked hours can be checked against something real.
  const shift: any = await WorkShift.create({
    name: `${TAG} Day`,
    code: `${TAG}-DAY`,
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 30,
    isActive: true,
  });
  const ymd = `${today().getFullYear()}-${String(today().getMonth() + 1).padStart(2, "0")}-${String(today().getDate()).padStart(2, "0")}`;
  await EmployeeShift.create({
    employeeId: emp._id,
    date: ymd,
    workShiftId: shift._id,
    shift: "general",
  });

  const asEmployee = { adminId: adminAcc._id };

  section("Before punching");
  const before = await call(C.mine, { ...asEmployee, query: {} });
  ok("the employee is recognised", before.data?.linked === true, JSON.stringify(before.data?.hint));
  ok("today is empty", before.data?.today === null);
  ok("punch-in is offered", before.data?.canPunchIn === true);
  ok("punch-out is not", before.data?.canPunchOut === false);
  ok("their shift is shown", before.data?.shift?.name === `${TAG} Day`, JSON.stringify(before.data?.shift));

  section("Punching in");
  const pin = await call(C.punch, { ...asEmployee, body: { type: "in" } });
  ok("the punch is accepted", pin.code !== 0, JSON.stringify(pin.data));
  ok("a time is stamped", /^\d{2}:\d{2}$/.test(pin.data?.today?.checkIn || ""), pin.data?.today?.checkIn);
  ok("the day is marked present", pin.data?.today?.status === "present");
  ok("it is linked to the shift", String(pin.data?.today?.shiftId) === String(shift._id));

  const again = await call(C.punch, { ...asEmployee, body: { type: "in" } });
  ok("punching in twice is refused", again.code === 0, JSON.stringify(again.data));
  ok("and says when they already punched", /already punched in/i.test(JSON.stringify(again.data)));

  section("Punching out");
  const out = await call(C.punch, { ...asEmployee, body: { type: "out" } });
  ok("the punch-out is accepted", out.code !== 0, JSON.stringify(out.data));
  ok("a check-out time is stamped", !!out.data?.today?.checkOut);
  ok("worked minutes are computed", typeof out.data?.today?.workedMinutes === "number");
  const outAgain = await call(C.punch, { ...asEmployee, body: { type: "out" } });
  ok("punching out twice is refused", outAgain.code === 0);

  section("Order is enforced");
  const other: any = await HrEmployee.create({
    employeeCode: `${TAG}-2`,
    fullName: `${TAG} Second`,
    joiningDate: new Date(2024, 0, 1),
    status: "active",
    isDeleted: false,
    linkedAdminId: (await Admin.create({
      fullName: `${TAG} Second`,
      email: `${TAG.toLowerCase()}2@example.com`,
      password: "x".repeat(20),
      roleId: role._id,
      roleName: role.name,
      isActive: true,
    }))._id,
    createdByAdminId: new Types.ObjectId(),
  });
  const outFirst = await call(C.punch, {
    adminId: other.linkedAdminId,
    body: { type: "out" },
  });
  ok("punching out before punching in is refused", outFirst.code === 0, JSON.stringify(outFirst.data));
  ok("and explains why", /punch in first/i.test(JSON.stringify(outFirst.data)));

  section("You can only punch your own day");
  const stranger = await call(C.punch, {
    adminId: new Types.ObjectId(), // a login with no employee record
    body: { type: "in", employeeId: String(emp._id) }, // and a forged body
  });
  ok("an unlinked login cannot punch", stranger.code === 0, JSON.stringify(stranger.data));
  ok("the employeeId in the body is ignored",
    (await Attendance.countDocuments({ employeeId: emp._id, date: today() })) === 1);

  section("A bad location never costs the day");
  const far: any = await HrEmployee.findOne({ _id: other._id });
  const withBadGps = await call(C.punch, {
    adminId: far.linkedAdminId,
    body: { type: "in", lat: 0, lng: 0 }, // nowhere near any fence
  });
  ok("the punch is still recorded", withBadGps.code !== 0, JSON.stringify(withBadGps.data));
  ok("and the day is present", withBadGps.data?.today?.status === "present");

  section("HR can correct the day by hand");
  const ymdToday = ymd;
  // Someone forgot to punch out; HR sets both times straight.
  const corrected = await call(markBulk, {
    adminId: new Types.ObjectId(),
    body: {
      date: ymdToday,
      entries: [
        {
          employeeId: String(emp._id),
          status: "present",
          checkIn: "09:05",
          checkOut: "18:10",
          remarks: "forgot to punch out",
        },
      ],
    },
  });
  ok("the correction is accepted", corrected.code !== 0, JSON.stringify(corrected.data));
  const fixed: any = await Attendance.findOne({ employeeId: emp._id, date: today() }).lean();
  ok("the times are updated", fixed?.checkIn === "09:05" && fixed?.checkOut === "18:10",
    `${fixed?.checkIn}-${fixed?.checkOut}`);
  ok("the reason is kept on the record", fixed?.remarks === "forgot to punch out");
  // 09:05–18:10 is 545 minutes, less a 30-minute break = 515.
  ok("hours are recomputed from the corrected times", fixed?.workedMinutes === 515,
    String(fixed?.workedMinutes));
  ok("overtime is recomputed too", typeof fixed?.overtimeMinutes === "number");

  const roster = await call(byDate, { query: { date: ymdToday } });
  const mine = (roster.data?.roster || []).find(
    (r: any) => String(r.employee._id) === String(emp._id),
  );
  ok("the roster shows the corrected punches to HR",
    mine?.attendance?.checkIn === "09:05" && mine?.attendance?.checkOut === "18:10",
    JSON.stringify(mine?.attendance?.checkIn));

  section("It feeds the HR dashboard");
  const dash: any = { query: {}, admin: { permissions: [PERMISSIONS.LEAVE_VIEW] } };
  await hrSummary(dash, {} as any, (() => undefined) as any);
  ok("present-today counts the punched-in staff", (dash.rData?.presentToday ?? 0) >= 2,
    String(dash.rData?.presentToday));

  section("The employee sees their own record");
  const after = await call(C.mine, { ...asEmployee, query: {} });
  ok("today shows both punches", !!after.data?.today?.checkIn && !!after.data?.today?.checkOut);
  ok("neither button is offered again", after.data?.canPunchIn === false && after.data?.canPunchOut === false);
  ok("the period's rows are returned", Array.isArray(after.data?.rows) && after.data.rows.length >= 1);
  ok("a summary is included", typeof after.data?.summary?.presentDays === "number",
    JSON.stringify(after.data?.summary?.presentDays));
  ok("only their own rows come back",
    (after.data?.rows || []).every((r: any) => String(r.employeeId) === String(emp._id)));

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
