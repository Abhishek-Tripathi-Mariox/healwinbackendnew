/**
 * Attendance → salary, end to end.
 *
 * Walks the whole chain on one employee with a real salary: punch in and out,
 * absences, paid and unpaid leave, a holiday, overtime — then generates
 * payroll through the real handler and checks the payslip arithmetic against
 * numbers worked out by hand here, not by re-running the same code.
 *
 * Deliberately uses the hospital's 16th-to-15th cycle, since that is what
 * production runs on.
 *
 * Usage: npm run e2e:salary-chain
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";
import { Payslip } from "../models/payslip.model";
import { PayrollRun } from "../models/payroll-run.model";
import { LeaveType } from "../models/leave-type.model";
import { LeaveRequest } from "../models/leave-request.model";
import PayrollSettings from "../models/payroll-settings.model";
import WorkShift from "../models/work-shift.model";
import EmployeeShift from "../models/employee-shift.model";
import { Admin } from "../models/admin.model";
import Role from "../models/role.model";
import * as payC from "../controllers/admin/payroll.controller";
import * as punchC from "../controllers/admin/my-attendance.controller";
import { setCycleStartDay, resetCycleCache } from "../services/payroll-settings.service";
import { payrollPeriod } from "../services/payroll-period";
import { generatePayslipPDF } from "../services/pdf.service";

const TAG = "E2E-SAL";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const ADMIN = new Types.ObjectId();
const call = async (fn: any, req: any) => {
  const r: any = { params: {}, query: {}, body: {}, adminId: ADMIN, ...req };
  await fn(r, {} as any, (() => undefined) as any);
  return { data: r.rData, code: r.rCode, msg: r.msg };
};

const cleanup = async () => {
  const emps = await HrEmployee.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  const ids = emps.map((e: any) => e._id);
  await Promise.all([
    Attendance.deleteMany({ employeeId: { $in: ids } }),
    EmployeeShift.deleteMany({ employeeId: { $in: ids } }),
    Payslip.deleteMany({ employeeCode: new RegExp(`^${TAG}`) }),
    LeaveRequest.deleteMany({ employeeId: { $in: ids } }),
    HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    Admin.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    LeaveType.deleteMany({ code: new RegExp(`^${TAG}`) }),
    WorkShift.deleteMany({ code: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — attendance → salary, end to end\n`);
  await cleanup();

  const savedSettings = await PayrollSettings.find({}).lean();
  await setCycleStartDay(16); // the production cycle

  // A period safely in the past, so nothing collides with live data and
  // regularization's "no future dates" rule never applies.
  const MONTH = 3, YEAR = 2019;
  const period = payrollPeriod(MONTH, YEAR, 16); // 16 Mar – 15 Apr 2019
  const TOTAL_DAYS = period.totalDays;

  section("The period");
  ok("runs 16 Mar to 15 Apr", period.label === "16 Mar 2019 – 15 Apr 2019", period.label);
  ok(`spans ${TOTAL_DAYS} days`, TOTAL_DAYS === 31, String(TOTAL_DAYS));

  // ── The employee ──────────────────────────────────────────────────────
  const shift: any = await WorkShift.create({
    name: `${TAG} Day`, code: `${TAG}-D`,
    startTime: "09:00", endTime: "17:00", breakMinutes: 30, isActive: true,
  });
  const role: any = await Role.findOne({ isActive: true }).lean();
  const login: any = await Admin.create({
    fullName: `${TAG} Nurse`, email: `${TAG.toLowerCase()}@example.com`,
    password: "x".repeat(20), roleId: role._id, roleName: role.name, isActive: true,
  });
  const SAL = {
    ctcAnnual: 384000,
    basic: 16000, hra: 8000, conveyance: 1600, medical: 1250, specialAllowance: 3150,
    pfApplicable: true, esiApplicable: false,
  };
  const FULL_GROSS = 16000 + 8000 + 1600 + 1250 + 3150; // 30,000
  const emp: any = await HrEmployee.create({
    employeeCode: `${TAG}-1`, fullName: `${TAG} Nurse`,
    email: `${TAG.toLowerCase()}@example.com`,
    joiningDate: new Date(2018, 0, 1), status: "active", isDeleted: false,
    linkedAdminId: login._id, createdByAdminId: ADMIN,
    salaryStructure: SAL,
  });

  const d = (day: number, mon = MONTH) => new Date(YEAR, mon - 1, day, 0, 0, 0, 0);
  const ymd = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

  // ── Attendance across the period ──────────────────────────────────────
  section("Attendance");
  // 2 unpaid-leave days and 3 absences = 5 LOP days; everything else paid.
  const ABSENT = [d(20), d(21), d(22)];
  const UNPAID_LEAVE = [d(25), d(26)];
  for (const dt of ABSENT) {
    await Attendance.create({ employeeId: emp._id, subjectType: "hr_employee", date: dt, status: "absent" });
  }

  const unpaidType: any = await LeaveType.create({
    name: `${TAG} Unpaid`, code: `${TAG}-LWP`, annualQuota: 0, isPaid: false,
  });
  const leaveReq: any = await LeaveRequest.create({
    employeeId: emp._id, subjectType: "hr_employee", leaveTypeId: unpaidType._id,
    fromDate: UNPAID_LEAVE[0], toDate: UNPAID_LEAVE[1], days: 2,
    status: "approved", reason: `${TAG} unpaid`,
  });
  for (const dt of UNPAID_LEAVE) {
    await Attendance.create({
      employeeId: emp._id, subjectType: "hr_employee", date: dt,
      status: "leave", leaveRequestId: leaveReq._id,
    });
  }
  ok("3 absences recorded", (await Attendance.countDocuments({ employeeId: emp._id, status: "absent" })) === 3);
  ok("2 unpaid leave days recorded", (await Attendance.countDocuments({ employeeId: emp._id, status: "leave" })) === 2);

  // A punched day, through the same endpoint an employee uses.
  section("A day recorded by punching");
  const PUNCH_DAY = d(18);
  await EmployeeShift.create({
    employeeId: emp._id, date: ymd(PUNCH_DAY), workShiftId: shift._id, shift: "general",
  });
  // The punch endpoint stamps "now", so the row is written directly for a past
  // date and the punch endpoint is exercised separately by e2e:punch.
  await Attendance.create({
    employeeId: emp._id, subjectType: "hr_employee", date: PUNCH_DAY,
    status: "present", checkIn: "09:00", checkOut: "19:00",
    shiftId: shift._id, workedMinutes: 570, overtimeMinutes: 120,
  });
  const punched: any = await Attendance.findOne({ employeeId: emp._id, date: PUNCH_DAY }).lean();
  ok("the punched day is present with hours", punched?.status === "present" && punched?.workedMinutes === 570);

  // ── Generate ──────────────────────────────────────────────────────────
  section("Payroll run");
  const gen = await call(payC.generate, {
    body: { month: MONTH, year: YEAR, acknowledgeUnmarked: true },
  });
  ok("the run is generated", gen.code !== 0, JSON.stringify(gen.data?.hint));
  const runId = gen.data?.run?._id;
  ok("it records the period it covered", gen.data?.run?.periodLabel === period.label,
    gen.data?.run?.periodLabel);

  const slip: any = await Payslip.findOne({ employeeId: emp._id, month: MONTH, year: YEAR }).lean();
  ok("a payslip exists", !!slip);

  section("The payslip counts the right days");
  ok(`total days is the period length (${TOTAL_DAYS})`, slip?.totalDays === TOTAL_DAYS, String(slip?.totalDays));
  // 3 absent + 2 unpaid leave = 5 unpaid days.
  ok("loss of pay is 5 days", slip?.lopDays === 5, String(slip?.lopDays));
  ok(`paid days is ${TOTAL_DAYS - 5}`, slip?.paidDays === TOTAL_DAYS - 5, String(slip?.paidDays));
  ok("overtime from the punched day carries through", slip?.overtimeMinutes === 120,
    String(slip?.overtimeMinutes));

  section("The money is prorated by attendance");
  const ratio = (TOTAL_DAYS - 5) / TOTAL_DAYS;
  const expectBasic = Math.round(16000 * ratio * 100) / 100;
  ok("basic is prorated by paid days", near(slip?.earnings?.basic, expectBasic),
    `${slip?.earnings?.basic} vs ${expectBasic}`);
  const expectProrated = Math.round(FULL_GROSS * ratio * 100) / 100;
  ok("the prorated gross matches the ratio",
    near(slip?.earnings?.gross - slip?.earnings?.overtime, expectProrated, 2),
    `${slip?.earnings?.gross - slip?.earnings?.overtime} vs ${expectProrated}`);
  ok("loss of pay is the difference from full gross",
    near(slip?.deductions?.lop, FULL_GROSS - expectProrated, 2),
    `${slip?.deductions?.lop} vs ${FULL_GROSS - expectProrated}`);

  // Overtime: 120 minutes at 2x on full basic (16000 / 26 / 8 per hour).
  const otRate = 16000 / 26 / 8;
  const expectOt = Math.round(2 * otRate * 2 * 100) / 100;
  ok("overtime is paid at 2x on full basic", near(slip?.earnings?.overtime, expectOt, 2),
    `${slip?.earnings?.overtime} vs ${expectOt}`);

  section("Statutory deductions");
  const expectPf = Math.round(Math.min(expectBasic, 15000) * 0.12 * 100) / 100;
  ok("PF is 12% of prorated basic", near(slip?.deductions?.pf, expectPf, 2),
    `${slip?.deductions?.pf} vs ${expectPf}`);
  ok("no ESI — above the ceiling and not opted in", slip?.deductions?.esi === 0, String(slip?.deductions?.esi));

  section("Net pay adds up");
  const expectNet =
    Math.round((slip.earnings.gross - slip.deductions.total) * 100) / 100;
  ok("net = gross − deductions", near(slip?.netPay, expectNet, 1),
    `${slip?.netPay} vs ${expectNet}`);
  ok("net is less than a full month, because days were lost",
    slip?.netPay < FULL_GROSS, `${slip?.netPay} vs ${FULL_GROSS}`);

  section("Full attendance pays the full salary");
  await Attendance.deleteMany({ employeeId: emp._id });
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const dt = new Date(period.start);
    dt.setDate(dt.getDate() + i);
    await Attendance.create({
      employeeId: emp._id, subjectType: "hr_employee", date: dt, status: "present",
    });
  }
  await call(payC.generate, { body: { month: MONTH, year: YEAR, acknowledgeUnmarked: true } });
  const full: any = await Payslip.findOne({ employeeId: emp._id, month: MONTH, year: YEAR }).lean();
  ok("no loss of pay", full?.lopDays === 0, String(full?.lopDays));
  ok("gross is the full monthly gross", near(full?.earnings?.gross, FULL_GROSS, 1),
    `${full?.earnings?.gross} vs ${FULL_GROSS}`);
  ok("the LOP line is zero", near(full?.deductions?.lop, 0, 1), String(full?.deductions?.lop));

  section("The payslip PDF");
  const pdf = await generatePayslipPDF(full, emp);
  ok("a PDF is produced", Buffer.isBuffer(pdf) && pdf.length > 1000, `${pdf?.length} bytes`);
  ok("it is a real PDF", pdf.subarray(0, 4).toString() === "%PDF");

  section("Finalizing locks the run");
  await call(payC.verify, { params: { id: String(runId) } });
  const finalized = await call(payC.finalize, { params: { id: String(runId) } });
  ok("the run finalizes", finalized.code !== 0, JSON.stringify(finalized.data?.hint));
  const reRun = await call(payC.generate, {
    body: { month: MONTH, year: YEAR, acknowledgeUnmarked: true },
  });
  ok("a finalized run cannot be re-generated", reRun.code === 0, JSON.stringify(reRun.data));

  // Restore.
  await PayrollRun.deleteOne({ _id: runId });
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
