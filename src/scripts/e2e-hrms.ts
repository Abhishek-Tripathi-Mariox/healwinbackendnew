/**
 * HRMS end-to-end test.
 *
 * Drives the real controllers against the real database — same code the HTTP
 * routes call, so models, services, validation and cross-module integration
 * are all exercised. Everything it creates is prefixed E2E- and removed at the
 * end, whether the run passes or fails.
 *
 * Usage: npm run e2e:hrms
 */
import mongoose from "mongoose";
import config from "../config";

import WorkShift from "../models/work-shift.model";
import HrEmployee from "../models/hr-employee.model";
import EmployeeShift from "../models/employee-shift.model";
import Attendance from "../models/attendance.model";
import Holiday from "../models/holiday.model";
import { LeaveType } from "../models/leave-type.model";
import { LeaveRequest } from "../models/leave-request.model";
import { LeaveBalance } from "../models/leave-balance.model";
import AttendanceRegularization from "../models/attendance-regularization.model";
import { PayrollRun } from "../models/payroll-run.model";
import { Payslip } from "../models/payslip.model";
import GeofenceLocation from "../models/geofence-location.model";
import { CareerApplication } from "../models/career-application.model";
import { Career } from "../models/career.model";
import { Admin } from "../models/admin.model";

/**
 * Mongoose only registers a model when its module is imported. The server
 * pulls these in through the route tree; this script does not, so every model
 * that a .populate() in the code under test refers to has to be imported here
 * or the populate throws MissingSchemaError.
 */
import "../models/department.model";
import "../models/designation.model";
import "../models/employment-type.model";
import "../models/ambulance-staff.model";
import "../models/centre.model";

import * as shiftC from "../controllers/admin/work-shift.controller";
import * as attC from "../controllers/admin/attendance.controller";
import * as arC from "../controllers/admin/attendance-regularization.controller";
import * as leaveC from "../controllers/admin/leave.controller";
import * as payC from "../controllers/admin/payroll.controller";
import * as repC from "../controllers/admin/hr-reports.controller";
import * as geoC from "../controllers/admin/geofence.controller";
import * as appC from "../controllers/admin/application.controller";
import * as empC from "../controllers/admin/hr-employee.controller";
import { evaluateGeofence } from "../services/attendance.service";

const TAG = "E2E-HRMS";
let pass = 0;
let fail = 0;
const failures: string[] = [];

const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

/** Invoke a controller the way the router does and collect what it set. */
const call = async (
  fn: any,
  opts: {
    params?: any; query?: any; body?: any; adminId?: any; file?: any;
  } = {},
): Promise<{ code: number; msg: string; data: any; http?: number }> => {
  const req: any = {
    params: opts.params || {},
    query: opts.query || {},
    body: opts.body || {},
    adminId: opts.adminId,
    file: opts.file,
    rData: undefined,
    rCode: undefined,
    msg: undefined,
  };
  let http: number | undefined;
  let jsonBody: any;
  const res: any = {
    locals: {},
    status(c: number) { http = c; return res; },
    json(b: any) { jsonBody = b; return res; },
    set() { return res; },
    setHeader() { return res; },
    end() { return res; },
  };
  await fn(req, res, () => undefined);
  return {
    code: req.rCode ?? (http && http >= 400 ? 0 : 1),
    msg: req.msg ?? jsonBody?.message ?? "",
    data: req.rData ?? res.locals.data ?? jsonBody,
    http,
  };
};

const cleanup = async () => {
  const emps = await HrEmployee.find({ employeeCode: new RegExp(`^${TAG}`) }).select("_id").lean();
  const empIds = emps.map((e) => e._id);
  const apps = await CareerApplication.find({ name: new RegExp(`^${TAG}`) }).select("_id").lean();
  await Promise.all([
    WorkShift.deleteMany({ code: new RegExp(`^${TAG}`) }),
    HrEmployee.deleteMany({ employeeCode: new RegExp(`^${TAG}`) }),
    EmployeeShift.deleteMany({ employeeId: { $in: empIds } }),
    Attendance.deleteMany({ employeeId: { $in: empIds } }),
    AttendanceRegularization.deleteMany({ employeeId: { $in: empIds } }),
    LeaveRequest.deleteMany({ employeeId: { $in: empIds } }),
    LeaveBalance.deleteMany({ employeeId: { $in: empIds } }),
    Payslip.deleteMany({ employeeId: { $in: empIds } }),
    Holiday.deleteMany({ name: new RegExp(`^${TAG}`) }),
    // applyHolidays writes a row for EVERY employee on the rolls, including
    // the real ones. The test date is in 2019 — before this system existed —
    // so clearing that whole day is safe and leaves no residue behind.
    Attendance.deleteMany({ date: new Date(2019, 2, 10) }),
    LeaveType.deleteMany({ code: "E2ECL" }),
    GeofenceLocation.deleteMany({ name: new RegExp(`^${TAG}`) }),
    CareerApplication.deleteMany({ _id: { $in: apps.map((a) => a._id) } }),
    Career.deleteMany({ title: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log("✅ Connected to MongoDB\n");
  await cleanup(); // clear anything a previous aborted run left behind

  const admin = await Admin.findOne().select("_id").lean();
  const adminId = admin?._id;
  // A month safely in the PAST: regularization legitimately refuses future
  // dates, and 2019 predates the system so it cannot collide with real data.
  const YEAR = 2019;
  const MONTH = 3; // March 2019, 31 days
  let payrollRunId: any;

  try {
    // ══ §3 SHIFT MASTER ══
    section("§3 Shift Master");
    let r = await call(shiftC.save, {
      body: {
        name: `${TAG} General`, code: `${TAG}-GEN`,
        startTime: "09:00", endTime: "17:00", breakMinutes: 30,
        graceMinutes: 10, fullDayMinutes: 450, halfDayMinutes: 225,
        overtimeAfterMinutes: 30,
      },
    });
    ok("create a General shift", r.code === 1, r.data?.hint);
    const genShift = r.data?.item;

    r = await call(shiftC.save, {
      body: {
        name: `${TAG} Night`, code: `${TAG}-NGT`,
        startTime: "19:00", endTime: "07:00", breakMinutes: 60,
        graceMinutes: 15, fullDayMinutes: 660, halfDayMinutes: 330,
        overtimeAfterMinutes: 30,
      },
    });
    ok("create an overnight shift", r.code === 1, r.data?.hint);
    const nightShift = r.data?.item;

    r = await call(shiftC.save, {
      body: { name: "Bad", code: `${TAG}-BAD`, startTime: "9am", endTime: "17:00" },
    });
    ok("reject a malformed shift time", r.code === 0);

    r = await call(shiftC.save, {
      body: { name: "Dup", code: `${TAG}-GEN`, startTime: "09:00", endTime: "17:00" },
    });
    ok("reject a duplicate shift code", r.code === 0);

    r = await call(shiftC.list, { query: {} });
    const listed = (r.data?.items || []).filter((s: any) => String(s.code).startsWith(TAG));
    const night = listed.find((s: any) => s.code === `${TAG}-NGT`);
    ok("shift list reports overnight + paid length", night?.isOvernight === true && night?.lengthMinutes === 660,
       `overnight=${night?.isOvernight} len=${night?.lengthMinutes}`);

    // ══ §2 EMPLOYEE (category + salary) ══
    section("§2 Employee Management");
    r = await call(empC.create, {
      adminId,
      body: {
        fullName: `${TAG} Day Worker`,
        category: "clinical",
        joiningDate: new Date(YEAR, MONTH - 1, 1),
        phone: "9999900001",
        defaultShiftId: genShift._id,
      },
    });
    ok("create an employee with a category", r.code === 1, JSON.stringify(r.data));
    const emp = r.data?.employee || r.data?.item;
    ok("employee category persisted", emp?.category === "clinical");

    // Give them a salary structure so payroll has something to compute.
    await HrEmployee.updateOne(
      { _id: emp._id },
      {
        employeeCode: `${TAG}-1`,
        salaryStructure: {
          ctcAnnual: 300000, basic: 12000, hra: 6000, conveyance: 2000,
          medical: 1000, specialAllowance: 4000, otherAllowances: [],
          pfApplicable: true, esiApplicable: true, ptApplicable: true,
        },
      },
    );

    // A mid-month joiner, to prove proration.
    const joiner = await HrEmployee.create({
      employeeCode: `${TAG}-2`,
      fullName: `${TAG} Mid Joiner`,
      category: "support",
      joiningDate: new Date(YEAR, MONTH - 1, 29), // joins on the 29th of 31
      status: "active",
      createdByAdminId: adminId,
      defaultShiftId: genShift._id,
      salaryStructure: {
        ctcAnnual: 300000, basic: 12000, hra: 6000, conveyance: 2000,
        medical: 1000, specialAllowance: 4000, otherAllowances: [],
        pfApplicable: true, esiApplicable: true, ptApplicable: true,
      },
    });
    // Someone off the payroll entirely.
    await HrEmployee.create({
      employeeCode: `${TAG}-3`,
      fullName: `${TAG} Inactive`,
      joiningDate: new Date(YEAR - 1, 0, 1),
      status: "inactive",
      createdByAdminId: adminId,
      salaryStructure: { ctcAnnual: 300000, basic: 12000, hra: 6000, conveyance: 2000, medical: 1000, specialAllowance: 4000, otherAllowances: [], pfApplicable: true, esiApplicable: true, ptApplicable: true },
    });

    // ══ §5 WORKING HOURS & OVERTIME ══
    section("§5 Working Hours & Overtime");
    await EmployeeShift.create({
      employeeId: emp._id,
      date: `${YEAR}-0${MONTH}-04`,
      shift: "general",
      workShiftId: genShift._id,
    });
    r = await call(attC.markBulk, {
      adminId,
      body: {
        date: `${YEAR}-0${MONTH}-04`,
        entries: [{ employeeId: String(emp._id), status: "present", checkIn: "09:00", checkOut: "19:00" }],
      },
    });
    ok("mark attendance with punches", r.code === 1, r.data?.hint);
    let day: any = await Attendance.findOne({ employeeId: emp._id, date: new Date(YEAR, MONTH - 1, 4) }).lean();
    ok("worked minutes computed from punches", day?.workedMinutes === 570, `got ${day?.workedMinutes}`);
    ok("overtime computed past the buffer", day?.overtimeMinutes === 120, `got ${day?.overtimeMinutes}`);
    ok("shift linked to the day", String(day?.shiftId) === String(genShift._id));

    // Overnight shift crossing midnight.
    await EmployeeShift.create({
      employeeId: emp._id, date: `${YEAR}-0${MONTH}-05`,
      shift: "night", workShiftId: nightShift._id,
    });
    await call(attC.markBulk, {
      adminId,
      body: {
        date: `${YEAR}-0${MONTH}-05`,
        entries: [{ employeeId: String(emp._id), status: "present", checkIn: "19:00", checkOut: "07:00" }],
      },
    });
    day = await Attendance.findOne({ employeeId: emp._id, date: new Date(YEAR, MONTH - 1, 5) }).lean();
    ok("overnight shift measured across midnight", day?.workedMinutes === 660, `got ${day?.workedMinutes}`);
    ok("no phantom overtime on an exact overnight shift", day?.overtimeMinutes === 0, `got ${day?.overtimeMinutes}`);

    // A missed punch must be reported, not silently zeroed.
    r = await call(attC.markBulk, {
      adminId,
      body: {
        date: `${YEAR}-0${MONTH}-06`,
        entries: [{ employeeId: String(emp._id), status: "present", checkIn: "09:00" }],
      },
    });
    ok("missed punch reported back to the caller", (r.data?.missedPunches || []).length === 1);

    // ══ §7 HOLIDAYS → ATTENDANCE ══
    section("§7 Holiday integration");
    await Holiday.create({ name: `${TAG} Festival`, date: new Date(YEAR, MONTH - 1, 10), year: YEAR, isActive: true });
    r = await call(attC.applyHolidays, { adminId, body: { month: MONTH, year: YEAR } });
    ok("apply holidays to attendance", r.code === 1 && r.data?.daysMarked > 0, JSON.stringify(r.data));
    const holidayRow: any = await Attendance.findOne({ employeeId: emp._id, date: new Date(YEAR, MONTH - 1, 10) }).lean();
    ok("holiday written into attendance", holidayRow?.status === "holiday",
       `row=${JSON.stringify(holidayRow)} applied=${JSON.stringify(r.data)}`);
    // Re-running must not overwrite a day that already carries a decision.
    const before = await Attendance.findOne({ employeeId: emp._id, date: new Date(YEAR, MONTH - 1, 4) }).lean();
    await call(attC.applyHolidays, { adminId, body: { month: MONTH, year: YEAR } });
    const after = await Attendance.findOne({ employeeId: emp._id, date: new Date(YEAR, MONTH - 1, 4) }).lean();
    ok("holidays never overwrite an existing decision", before?.status === after?.status && after?.status === "present");
    ok("mid-month joiner gets no holiday before joining",
       !(await Attendance.findOne({ employeeId: joiner._id, date: new Date(YEAR, MONTH - 1, 10) })));

    // ══ §6 LEAVE ══
    section("§6 Leave");
    const lt = await LeaveType.create({ name: `${TAG} Casual`, code: "E2ECL", annualQuota: 12, isPaid: true });
    r = await call(leaveC.createRequest, {
      body: {
        employeeId: String(emp._id), leaveTypeId: String(lt._id),
        fromDate: `${YEAR}-0${MONTH}-12`, toDate: `${YEAR}-0${MONTH}-13`, reason: "e2e",
      },
    });
    ok("create a leave request", r.code === 1);
    const leaveId = r.data?.item?._id;
    r = await call(leaveC.approveRequest, { adminId, params: { id: String(leaveId) } });
    ok("approve the leave", r.code === 1, r.data?.hint);
    ok("leave written into attendance",
       (await Attendance.countDocuments({ employeeId: emp._id, leaveRequestId: leaveId, status: "leave" })) === 2);
    let bal: any = await LeaveBalance.findOne({ employeeId: emp._id, leaveTypeId: lt._id, year: YEAR }).lean();
    ok("balance decremented on approval", bal?.used === 2 && bal?.balance === 10, JSON.stringify(bal));

    // Overlap must be refused.
    r = await call(leaveC.createRequest, {
      body: { employeeId: String(emp._id), leaveTypeId: String(lt._id), fromDate: `${YEAR}-0${MONTH}-13`, toDate: `${YEAR}-0${MONTH}-14` },
    });
    const overlapId = r.data?.item?._id;
    r = await call(leaveC.approveRequest, { adminId, params: { id: String(overlapId) } });
    ok("overlapping leave refused", r.code === 0, r.data?.hint);

    // Cancellation gives the days and the balance back.
    r = await call(leaveC.cancelRequest, { adminId, params: { id: String(leaveId) } });
    ok("cancel an approved leave", r.code === 1);
    ok("leave attendance rows removed on cancel",
       (await Attendance.countDocuments({ employeeId: emp._id, leaveRequestId: leaveId, status: "leave" })) === 0);
    bal = await LeaveBalance.findOne({ employeeId: emp._id, leaveTypeId: lt._id, year: YEAR }).lean();
    ok("balance restored on cancel", bal?.used === 0 && bal?.balance === 12, JSON.stringify(bal));

    // ══ §4.5 REGULARIZATION ══
    section("§4.5 Attendance Regularization");
    r = await call(arC.create, {
      adminId,
      body: {
        employeeId: String(emp._id), date: `${YEAR}-0${MONTH}-06`,
        reason: "MISSED_PUNCH", toStatus: "present",
        toCheckIn: "09:00", toCheckOut: "18:00", note: "forgot to punch out",
      },
    });
    ok("raise a regularization", r.code === 1, r.data?.hint);
    const arId = r.data?.item?._id;
    ok("snapshot of the original day captured", r.data?.item?.fromStatus === "present");

    r = await call(arC.create, {
      adminId,
      body: { employeeId: String(emp._id), date: `${YEAR}-0${MONTH}-06`, toStatus: "absent" },
    });
    ok("second pending request for the same day refused", r.code === 0, r.data?.hint);

    r = await call(arC.create, {
      adminId,
      body: { employeeId: String(emp._id), date: "2099-01-01", toStatus: "present" },
    });
    ok("future-dated regularization refused", r.code === 0);

    r = await call(arC.approve, { adminId, params: { id: String(arId) } });
    ok("approve the regularization", r.code === 1, r.data?.hint);
    day = await Attendance.findOne({ employeeId: emp._id, date: new Date(YEAR, MONTH - 1, 6) }).lean();
    ok("attendance rewritten with recomputed hours", day?.workedMinutes === 510, `got ${day?.workedMinutes}`);
    ok("regularization linked to the day", String(day?.regularizationId) === String(arId));

    // ══ §4.2 GEOFENCE ══
    section("§4.2 Configurable geofence");
    r = await call(geoC.save, {
      body: { name: `${TAG} Centre`, lat: 26.8467, lng: 80.9462, radiusMeters: 300, employeeCategories: ["ambulance"] },
    });
    ok("create a geofence location", r.code === 1, r.data?.hint);
    r = await call(geoC.save, { body: { name: `${TAG} Bad`, lat: 26.8, lng: 80.9, radiusMeters: 5 } });
    ok("reject a radius below GPS error", r.code === 0, r.data?.hint);
    const inside = await evaluateGeofence(26.8467, 80.9462, "ambulance");
    ok("a punch at the centre is inside the fence", inside?.withinGeofence === true);
    const outside = await evaluateGeofence(26.9000, 80.9462, "ambulance");
    ok("a punch 6 km away is outside", outside?.withinGeofence === false, `d=${outside?.distanceMeters}m`);
    ok("radius comes from the location, not a constant", inside?.radiusMeters === 300);

    // ══ §8 PAYROLL ══
    section("§8 Payroll");
    r = await call(payC.generate, {
      adminId,
      body: { month: MONTH, year: YEAR, acknowledgeUnmarked: true },
    });
    ok("generate the payroll run", r.code === 1, r.data?.hint);
    payrollRunId = r.data?.run?._id;

    const slip: any = await Payslip.findOne({ employeeId: emp._id, month: MONTH, year: YEAR }).lean();
    ok("payslip created", !!slip);
    // 120 from the 09:00–19:00 day, plus 60 from the day the regularization
    // rewrote to 09:00–18:00 (510 worked against a 450-minute shift).
    ok("overtime summed across the month onto the payslip",
       slip?.overtimeMinutes === 180, `got ${slip?.overtimeMinutes}`);
    ok("overtime paid", (slip?.earnings?.overtime || 0) > 0, `got ${slip?.earnings?.overtime}`);

    const joinerSlip: any = await Payslip.findOne({ employeeId: joiner._id, month: MONTH, year: YEAR }).lean();
    ok("mid-month joiner prorated by days on the rolls", joinerSlip?.serviceDays === 3, `got ${joinerSlip?.serviceDays}`);
    ok("joiner's pre-joining days are not LOP", joinerSlip?.lopDays === 0, `got ${joinerSlip?.lopDays}`);
    ok("joiner paid roughly 3/31 of salary",
       Math.abs((joinerSlip?.earnings?.gross || 0) - (25000 * 3) / 31) < 1,
       `got ${joinerSlip?.earnings?.gross}`);

    const inactiveSlip = await Payslip.findOne({ employeeCode: `${TAG}-3`, month: MONTH, year: YEAR }).lean();
    ok("inactive employee excluded from payroll", !inactiveSlip);

    // Finalize must be blocked until verified.
    r = await call(payC.finalize, { adminId, params: { id: String(payrollRunId) } });
    ok("finalize refused before verification", r.code === 0 && r.data?.requiresVerification === true, r.data?.hint);

    r = await call(payC.verify, { adminId, params: { id: String(payrollRunId) }, body: { note: "e2e check" } });
    ok("verify the run", r.code === 1 && r.data?.run?.status === "verified");

    r = await call(payC.finalize, { adminId, params: { id: String(payrollRunId) } });
    ok("finalize after verification", r.code === 1 && r.data?.run?.status === "finalized");

    r = await call(payC.generate, { adminId, body: { month: MONTH, year: YEAR } });
    ok("a finalized run cannot be re-generated", r.code === 0, r.data?.hint);

    // ══ §13 REPORTS ══
    section("§13 Reports");
    for (const [name, fn, query] of [
      ["employee master", repC.employees, {}],
      ["attendance", repC.attendance, { month: MONTH, year: YEAR }],
      ["leave register", repC.leave, { year: YEAR }],
      ["leave balances", repC.leaveBalances, { year: YEAR }],
      ["payroll sheet", repC.payroll, { month: MONTH, year: YEAR }],
      ["shift roster", repC.shifts, { date: `${YEAR}-0${MONTH}-04` }],
      ["holiday calendar", repC.holidays, { year: YEAR }],
    ] as [string, any, any][]) {
      const rr = await call(fn, { query });
      ok(`${name} report returns columns + rows`,
         rr.code === 1 && Array.isArray(rr.data?.columns) && Array.isArray(rr.data?.rows) && rr.data.columns.length > 0,
         rr.data?.hint);
    }
    const attRep = await call(repC.attendance, { query: { month: MONTH, year: YEAR } });
    const myRow = (attRep.data?.rows || []).find((x: any) => String(x.employeeCode) === `${TAG}-1`);
    ok("attendance report shows worked hours", !!myRow && String(myRow.worked).includes("h"), JSON.stringify(myRow?.worked));
    const payRep = await call(repC.payroll, { query: { month: MONTH, year: YEAR } });
    ok("payroll sheet carries every salary component", (payRep.data?.columns || []).length >= 20);

    // ══ §9 RECRUITMENT ══
    section("§9 Recruitment");
    const career: any = await Career.create({
      title: `${TAG} Staff Nurse`,
      department: "Nursing",
      location: "Lucknow",
      qualification: "B.Sc Nursing",
      experience: "2+ years",
      type: "Full Time",
      isActive: true,
    });
    const application = await CareerApplication.create({
      careerId: career._id,
      name: `${TAG} Candidate`,
      email: "e2e-candidate@example.com",
      phone: "9999900002",
      position: "Staff Nurse",
      department: "Nursing",
      status: "NEW",
    });
    const appId = String(application._id);

    r = await call(appC.scheduleInterview, {
      adminId, params: { id: appId },
      body: { mode: "WALK_IN", scheduledAt: new Date(Date.now() + 864e5).toISOString(), venueAddress: "Healwin Centre, Lucknow", contactPerson: "HR Desk" },
    });
    ok("schedule a walk-in interview", !!r.data?.application, r.data?.message);
    ok("status moved to INTERVIEW_SCHEDULED", r.data?.application?.status === "INTERVIEW_SCHEDULED");

    r = await call(appC.scheduleInterview, {
      adminId, params: { id: appId },
      body: { mode: "ONLINE", scheduledAt: new Date(Date.now() + 864e5).toISOString() },
    });
    ok("online interview without a link refused", r.http === 400);

    r = await call(appC.saveEvaluation, {
      adminId, params: { id: appId },
      body: { rating: 8, recommendation: "SELECT", evaluationRemarks: "Strong clinical knowledge", interviewerName: "Dr Panel" },
    });
    ok("record the panel evaluation", r.data?.application?.interview?.rating === 8, r.data?.message);

    r = await call(appC.saveEvaluation, { adminId, params: { id: appId }, body: { rating: 44 } });
    ok("out-of-range rating refused", r.http === 400);

    // Appointment must not be possible before an offer exists.
    r = await call(appC.issueAppointment, { adminId, params: { id: appId }, body: {} });
    ok("appointment refused with no offer", r.http === 400);

    r = await call(appC.issueOffer, {
      adminId, params: { id: appId },
      body: { designation: "Staff Nurse", ctcAnnual: 480000, joiningDate: new Date(Date.now() + 30 * 864e5).toISOString() },
    });
    ok("issue the offer letter", r.data?.application?.status === "HIRED", r.data?.message);
    ok("offer letter archived to S3", r.data?.archivedToS3 === true);

    r = await call(appC.issueAppointment, { adminId, params: { id: appId }, body: {} });
    ok("appointment refused before the offer is accepted", r.http === 400 && r.data?.requiresAcceptance === true);

    r = await call(appC.recordOfferResponse, { adminId, params: { id: appId }, body: { accepted: true } });
    ok("record the candidate's acceptance", r.data?.application?.status === "OFFER_ACCEPTED");

    r = await call(appC.issueAppointment, {
      adminId, params: { id: appId },
      body: { designation: "Staff Nurse", joiningDate: new Date(Date.now() + 30 * 864e5).toISOString() },
    });
    ok("issue the appointment letter", r.data?.application?.status === "APPOINTED", r.data?.message);
    ok("appointment letter archived to S3", r.data?.archivedToS3 === true);
  } finally {
    section("Cleanup");
    await cleanup();
    if (payrollRunId) await PayrollRun.deleteOne({ _id: payrollRunId });
    await Payslip.deleteMany({ employeeCode: new RegExp(`^${TAG}`) });
    console.log("  ✅ test data removed");
    await mongoose.disconnect();
  }

  console.log(`\n${"═".repeat(46)}`);
  console.log(`  PASSED: ${pass}    FAILED: ${fail}`);
  if (fail) {
    console.log("\n  Failures:");
    failures.forEach((f) => console.log(`   • ${f}`));
  }
  console.log("═".repeat(46));
  process.exit(fail ? 1 : 0);
};

run().catch((e) => {
  console.error("\n💥 e2e crashed:", e);
  process.exit(1);
});
