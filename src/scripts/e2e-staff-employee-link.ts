/**
 * Panel logins and HR records stay in step.
 *
 * Adding someone under Team Management must put them on the employee roll,
 * creating an employee with a role must give them a login, and neither may
 * make the same person appear twice on the roster.
 *
 * Usage: npm run e2e:staff-link
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import { Admin } from "../models/admin.model";
import Role from "../models/role.model";
import { createStaff } from "../controllers/admin/staff.controller";
import {
  create as createEmployee,
  update as updateEmployee,
} from "../controllers/admin/hr-employee.controller";
import { list as listPeople } from "../controllers/admin/people.controller";
import { ensureEmployeeForAdmin } from "../services/employee-link.service";
import { PERMISSIONS } from "../models/role.model";

const TAG = "E2E-LINK";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const ADMIN = new Types.ObjectId();

/** Drive an Express-style controller (res.locals.data) or a rData one. */
const callExpress = async (fn: any, body: any) => {
  const res: any = { locals: {}, status: (c: number) => ({ json: (j: any) => { res._status = c; res._json = j; return res; } }) };
  const req: any = { body, adminId: ADMIN, params: {}, query: {} };
  await fn(req, res, (() => undefined) as any);
  return { data: res.locals.data, status: res._status, json: res._json };
};
const callR = async (fn: any, req: any) => {
  const r: any = { params: {}, query: {}, body: {}, adminId: ADMIN, ...req };
  await fn(r, {} as any, (() => undefined) as any);
  return { data: r.rData, code: r.rCode, msg: r.msg };
};

const cleanup = async () => {
  await Promise.all([
    HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    Admin.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — staff ↔ employee linking\n`);
  await cleanup();

  const role: any = await Role.findOne({ isActive: true }).lean();
  if (!role) {
    console.error("No active role found — seed roles first.");
    process.exit(1);
  }

  // ── Team Management → Employees ───────────────────────────────────────
  section("Adding a panel user creates the employee");
  const made = await callExpress(createStaff, {
    fullName: `${TAG} New Admin`,
    email: `${TAG.toLowerCase()}.admin@example.com`,
    password: "Str0ngPass!23",
    phone: "9876500055",
    roleId: String(role._id),
  });
  ok("staff created", !!made.data?.staff, JSON.stringify(made.json));
  ok("an employee code is reported back", !!made.data?.employeeCode, JSON.stringify(made.data?.employeeCode));

  const adminId = made.data?.staff?._id;
  const emp: any = await HrEmployee.findOne({ linkedAdminId: adminId }).lean();
  ok("the HR record exists", !!emp);
  ok("it carries the name from the login", emp?.fullName === `${TAG} New Admin`);
  ok("it carries the email and phone", emp?.email === `${TAG.toLowerCase()}.admin@example.com` && emp?.phone === "9876500055");
  ok("it is linked back to the login", String(emp?.linkedAdminId) === String(adminId));
  ok("it has a joining date so HR can open it", !!emp?.joiningDate);

  section("An existing employee is linked, not duplicated");
  const existing: any = await HrEmployee.create({
    employeeCode: `${TAG}-EXIST`,
    fullName: `${TAG} Already Here`,
    email: `${TAG.toLowerCase()}.exists@example.com`,
    joiningDate: new Date(2024, 0, 1),
    status: "active",
    isDeleted: false,
    createdByAdminId: ADMIN,
  });
  const secondAdmin: any = await Admin.create({
    fullName: `${TAG} Already Here`,
    email: `${TAG.toLowerCase()}.exists@example.com`,
    password: "x".repeat(20),
    roleId: role._id,
    roleName: role.name,
    isActive: true,
  });
  const linkRes = await ensureEmployeeForAdmin(secondAdmin, ADMIN);
  ok("the existing record is reused", linkRes?.created === false, JSON.stringify(linkRes));
  ok("and now points at the login",
    String((await HrEmployee.findById(existing._id).lean() as any)?.linkedAdminId) === String(secondAdmin._id));
  ok("no second employee was made",
    (await HrEmployee.countDocuments({ email: `${TAG.toLowerCase()}.exists@example.com`, isDeleted: false })) === 1);

  // ── Employees → panel login ───────────────────────────────────────────
  section("Creating an employee with a role gives them a login");
  const withRole = await callR(createEmployee, {
    body: {
      fullName: `${TAG} With Role`,
      email: `${TAG.toLowerCase()}.withrole@example.com`,
      phone: "9876500066",
      joiningDate: "2026-01-15",
      roleId: String(role._id),
    },
  });
  ok("employee created", !!withRole.data?.employee, JSON.stringify(withRole.data));
  ok("a panel login is reported", !!withRole.data?.panelLogin, JSON.stringify(withRole.data?.panelLogin));
  ok("a temporary password is returned once", !!withRole.data?.panelLogin?.temporaryPassword);
  // `password` is `select: false` on the schema, so it has to be asked for —
  // without the +select the check below would read undefined and pass for the
  // wrong reason.
  const createdAdmin: any = await Admin.findOne({ email: `${TAG.toLowerCase()}.withrole@example.com` })
    .select("+password roleName")
    .lean();
  ok("the login exists with that role", createdAdmin?.roleName === role.name, createdAdmin?.roleName);
  ok("the employee links to it",
    String(withRole.data?.employee?.linkedAdminId) === String(createdAdmin?._id));
  const storedPw = String(createdAdmin?.password || "");
  ok("a password hash was stored", storedPw.length > 0, `len=${storedPw.length}`);
  ok("it is a bcrypt hash, not the plain password",
    /^\$2[aby]\$/.test(storedPw) && storedPw !== withRole.data?.panelLogin?.temporaryPassword,
    storedPw.slice(0, 7));

  section("A role is optional");
  const noRole = await callR(createEmployee, {
    body: { fullName: `${TAG} No Role`, joiningDate: "2026-01-15" },
  });
  ok("employee created without one", !!noRole.data?.employee);
  ok("and gets no login", !noRole.data?.panelLogin);

  section("Refusals leave nothing half-made");
  const before = await HrEmployee.countDocuments({ fullName: new RegExp(`^${TAG}`) });
  const dupEmail = await callR(createEmployee, {
    body: {
      fullName: `${TAG} Duplicate Login`,
      email: `${TAG.toLowerCase()}.withrole@example.com`, // already has a login
      joiningDate: "2026-01-15",
      roleId: String(role._id),
    },
  });
  ok("a taken email is refused", dupEmail.code === 0, JSON.stringify(dupEmail.data));
  ok("and says so plainly", /already has a panel login/i.test(JSON.stringify(dupEmail.data)));
  ok("no employee was left behind",
    (await HrEmployee.countDocuments({ fullName: new RegExp(`^${TAG}`) })) === before,
    String(await HrEmployee.countDocuments({ fullName: new RegExp(`^${TAG}`) })));

  const noEmail = await callR(createEmployee, {
    body: { fullName: `${TAG} No Email`, joiningDate: "2026-01-15", roleId: String(role._id) },
  });
  ok("a role without an email is refused", noEmail.code === 0, JSON.stringify(noEmail.data));

  section("Setting a role from the edit form");
  // Someone with no login yet — choosing a role must create one.
  const plain: any = await HrEmployee.create({
    employeeCode: `${TAG}-PLAIN`,
    fullName: `${TAG} Gets Access`,
    email: `${TAG.toLowerCase()}.access@example.com`,
    joiningDate: new Date(2024, 0, 1),
    status: "active",
    isDeleted: false,
    createdByAdminId: ADMIN,
  });
  const granted = await callR(updateEmployee, {
    params: { id: String(plain._id) },
    body: { roleId: String(role._id) },
  });
  ok("a login is created for them", !!granted.data?.panelLogin, JSON.stringify(granted.data));
  ok("with a one-time password", !!granted.data?.panelLogin?.temporaryPassword);
  const nowLinked: any = await HrEmployee.findById(plain._id).lean();
  ok("and the employee is linked to it", !!nowLinked?.linkedAdminId);

  // Changing the role on someone who already has one.
  const otherRole: any = await Role.findOne({
    isActive: true,
    _id: { $ne: role._id },
  }).lean();
  if (otherRole) {
    const changed = await callR(updateEmployee, {
      params: { id: String(plain._id) },
      body: { roleId: String(otherRole._id) },
    });
    ok("changing the role does not create a second login", !changed.data?.panelLogin,
      JSON.stringify(changed.data?.panelLogin));
    const theirAdmin: any = await Admin.findById(nowLinked.linkedAdminId).lean();
    ok("the existing login now carries the new role",
      theirAdmin?.roleName === otherRole.name, theirAdmin?.roleName);
    ok("its permissions come from that role",
      Array.isArray(theirAdmin?.permissions) && theirAdmin.permissions.length > 0);
    ok("only one login exists for them",
      (await Admin.countDocuments({ email: `${TAG.toLowerCase()}.access@example.com`, isDeleted: { $ne: true } })) === 1);
  }

  const noEmailEdit: any = await HrEmployee.create({
    employeeCode: `${TAG}-NOEMAIL`,
    fullName: `${TAG} No Email Edit`,
    joiningDate: new Date(2024, 0, 1),
    status: "active",
    isDeleted: false,
    createdByAdminId: ADMIN,
  });
  const refused = await callR(updateEmployee, {
    params: { id: String(noEmailEdit._id) },
    body: { roleId: String(role._id), fullName: `${TAG} Renamed` },
  });
  ok("a role without an email is refused on edit", refused.code === 0, JSON.stringify(refused.data));
  ok("and the employee edit is not half-applied",
    (await HrEmployee.findById(noEmailEdit._id).lean() as any)?.fullName === `${TAG} No Email Edit`);

  // ── The roster ────────────────────────────────────────────────────────
  section("Nobody appears twice on the roster");
  const roster = await callR(listPeople, {
    query: { q: TAG, limit: 100 },
    admin: { permissions: [PERMISSIONS.EMPLOYEES_VIEW] },
  });
  const rows = roster.data.items || [];
  const names = rows.map((r: any) => r.name);
  const dupNames = names.filter((n: string, i: number) => names.indexOf(n) !== i);
  ok("no name is listed twice", dupNames.length === 0, JSON.stringify(dupNames));
  ok("the linked admin shows as an employee, not an admin",
    rows.find((r: any) => r.name === `${TAG} New Admin`)?.type === "hr_employee",
    JSON.stringify(rows.find((r: any) => r.name === `${TAG} New Admin`)));
  ok("and is flagged as having a panel login",
    rows.find((r: any) => r.name === `${TAG} New Admin`)?.hasPanelLogin === true);
  ok("their role column shows the panel role",
    rows.find((r: any) => r.name === `${TAG} New Admin`)?.role === role.name,
    rows.find((r: any) => r.name === `${TAG} New Admin`)?.role);

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
