/**
 * Compensatory off, against the real handlers and database.
 *
 * The rules that matter: a holiday must NOT hand everyone the day off (the
 * hospital runs), only people who actually worked can be credited, and the
 * same day cannot be credited twice.
 *
 * Usage: npm run e2e:comp-off
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";
import Holiday from "../models/holiday.model";
import CompOff from "../models/comp-off.model";
import { applyHolidaysToAttendance } from "../services/attendance.service";
import * as C from "../controllers/admin/comp-off.controller";

const TAG = "E2E-COFF";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 0, 0, 0, 0);
const ADMIN = new Types.ObjectId();

/** Drive a controller the way its route does. */
const call = async (fn: any, req: any) => {
  const r = { rData: undefined, rCode: undefined, msg: "", ...req };
  await fn(r, {} as any, (() => undefined) as any);
  return r;
};

const cleanup = async () => {
  const emps = await HrEmployee.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  const ids = emps.map((e: any) => e._id);
  await Promise.all([
    Attendance.deleteMany({ employeeId: { $in: ids } }),
    CompOff.deleteMany({ employeeId: { $in: ids } }),
    HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    Holiday.deleteMany({ name: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — compensatory off\n`);
  await cleanup();
  await CompOff.syncIndexes();

  const mk = (n: string) =>
    HrEmployee.create({
      fullName: `${TAG} ${n}`,
      employeeCode: `${TAG}-${n}`,
      joiningDate: day(2024, 1, 1),
      status: "active",
      isDeleted: false,
      createdByAdminId: ADMIN,
    });

  const worker: any = await mk("Worked");
  const absentee: any = await mk("Absent");
  const onLeave: any = await mk("OnLeave");

  // A date the real holiday calendar is unlikely to already use — 15 August
  // is seeded as Independence Day, and the lookup would return that instead.
  const HOLIDAY = day(2026, 8, 17);
  await Holiday.create({
    name: `${TAG} Independence Day`,
    date: HOLIDAY,
    year: 2026,
    type: "public",
    isWorkingDay: true, // the hospital runs
    isActive: true,
  });

  await Attendance.create({ employeeId: worker._id, subjectType: "hr_employee", date: HOLIDAY, status: "present" });
  await Attendance.create({ employeeId: absentee._id, subjectType: "hr_employee", date: HOLIDAY, status: "absent" });
  await Attendance.create({ employeeId: onLeave._id, subjectType: "hr_employee", date: HOLIDAY, status: "leave" });

  section("Attendance for more than one person on the same day");
  // Regression guard. The unique indexes here were `sparse` on compound keys,
  // which only skips a document missing EVERY indexed field — so every HR row
  // was indexed as { ambulanceStaffId: null, date } and the second employee
  // marked on a day was rejected outright.
  // Scoped to this test's employees — the database holds real staff too.
  const taggedIds = [worker._id, absentee._id, onLeave._id];
  const markedHere = await Attendance.countDocuments({
    date: HOLIDAY,
    employeeId: { $in: taggedIds },
  });
  ok("all three employees are marked on the same day", markedHere === 3, String(markedHere));

  section("A working holiday does not give everyone the day off");
  const applied = await applyHolidaysToAttendance(8, 2026, ADMIN);
  ok("no blanket holiday rows are written", applied.daysMarked === 0, `daysMarked=${applied.daysMarked}`);
  const stillPresent = await Attendance.findOne({ employeeId: worker._id, date: HOLIDAY }).lean();
  ok("the person who worked stays marked present", (stillPresent as any)?.status === "present");

  section("An actual closure still marks everyone off");
  await Holiday.updateOne({ name: `${TAG} Independence Day` }, { $set: { isWorkingDay: false } });
  const closed = await applyHolidaysToAttendance(8, 2026, ADMIN);
  ok("a closed holiday marks the untouched days", closed.holidays === 1, `holidays=${closed.holidays}`);
  await Holiday.updateOne({ name: `${TAG} Independence Day` }, { $set: { isWorkingDay: true } });

  section("Who worked");
  const w = await call(C.worked, { query: { date: "2026-08-17" }, adminId: ADMIN });
  const names = (w.rData.items || []).map((i: any) => i.fullName);
  ok("lists the person who worked", names.includes(`${TAG} Worked`));
  ok("leaves out the absentee", !names.includes(`${TAG} Absent`));
  ok("leaves out the person on leave", !names.includes(`${TAG} OnLeave`));
  ok("reports the holiday name", w.rData.holiday?.name === `${TAG} Independence Day`);
  ok("suggests one day for a full shift",
    (w.rData.items || []).find((i: any) => i.fullName === `${TAG} Worked`)?.suggestedDays === 1);

  section("Granting");
  const g = await call(C.grant, {
    body: { workedOn: "2026-08-17", entries: [{ employeeId: String(worker._id), days: 1 }] },
    adminId: ADMIN,
  });
  ok("grants the credit", g.rData?.granted === 1, JSON.stringify(g.rData));

  const again = await call(C.grant, {
    body: { workedOn: "2026-08-17", entries: [{ employeeId: String(worker._id), days: 1 }] },
    adminId: ADMIN,
  });
  ok("refuses a second credit for the same day", again.rData?.granted === 0, JSON.stringify(again.rData));
  ok("and says why", /already credited/.test(JSON.stringify(again.rData?.skipped || [])));

  const w2 = await call(C.worked, { query: { date: "2026-08-17" }, adminId: ADMIN });
  ok("the worked list now shows them as credited",
    (w2.rData.items || []).find((i: any) => i.fullName === `${TAG} Worked`)?.alreadyCredited === 1);

  section("Balance");
  const b = await call(C.balance, { params: { employeeId: String(worker._id) }, query: {}, adminId: ADMIN });
  ok("balance is one day", b.rData?.balance === 1, JSON.stringify(b.rData));

  section("Guards");
  const future = await call(C.grant, {
    body: { workedOn: "2099-01-01", entries: [{ employeeId: String(worker._id), days: 1 }] },
    adminId: ADMIN,
  });
  ok("refuses a day that has not happened", future.rCode === 0);

  const badDays = await call(C.grant, {
    body: { workedOn: "2026-08-17", entries: [{ employeeId: String(absentee._id), days: 99 }] },
    adminId: ADMIN,
  });
  ok("refuses an absurd number of days", badDays.rData?.granted === 0, JSON.stringify(badDays.rData));

  section("Cancelling");
  const credit: any = await CompOff.findOne({ employeeId: worker._id, status: "available" }).lean();
  const c = await call(C.cancel, { params: { id: String(credit._id) }, adminId: ADMIN });
  ok("cancels an unused credit", c.rData?.cancelled === true);
  const afterCancel = await call(C.balance, { params: { employeeId: String(worker._id) }, query: {}, adminId: ADMIN });
  ok("balance returns to zero", afterCancel.rData?.balance === 0);
  const regrant = await call(C.grant, {
    body: { workedOn: "2026-08-17", entries: [{ employeeId: String(worker._id), days: 1 }] },
    adminId: ADMIN,
  });
  ok("a cancelled day can be granted again", regrant.rData?.granted === 1, JSON.stringify(regrant.rData));

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
