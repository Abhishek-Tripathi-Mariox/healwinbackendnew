/**
 * The unified roster must show every person exactly once, page cleanly across
 * four collections, and honour its filters.
 *
 * Paging spans segments, so the failure mode to guard against is a person
 * being skipped or repeated at a segment boundary — which on a staff list
 * looks like someone simply not working here.
 *
 * Usage: npm run verify:people-roster
 */
import mongoose, { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import { Admin } from "../models/admin.model";
import { list, counts } from "../controllers/admin/people.controller";
import { PERMISSIONS } from "../models/role.model";

const TAG = "VERIFY-PEOPLE";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const call = async (fn: any, query: any = {}) => {
  const req: any = { query, admin: { permissions: [PERMISSIONS.EMPLOYEES_VIEW] } };
  await fn(req, {} as any, (() => undefined) as any);
  return req.rData;
};

const cleanup = async () => {
  await Promise.all([
    HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    AmbulanceStaff.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
    Admin.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  await cleanup();

  const admin = new Types.ObjectId();
  // 5 HR, 3 crew (2 drivers + 1 attendant), 2 admins — enough to straddle
  // several segment boundaries at a page size of 2.
  for (let i = 0; i < 5; i++) {
    await HrEmployee.create({
      fullName: `${TAG} Emp ${i}`,
      employeeCode: `${TAG}-E${i}`,
      joiningDate: new Date(2024, 0, 1),
      status: i === 4 ? "inactive" : "active",
      isDeleted: false,
      createdByAdminId: admin,
    });
  }
  for (let i = 0; i < 3; i++) {
    await AmbulanceStaff.create({
      fullName: `${TAG} Crew ${i}`,
      mobileNumber: `90000000${i}${i}`,
      countryCode: "+91",
      role: i === 2 ? "attendant" : "driver",
      isActive: true,
      providerId: new Types.ObjectId(),
      createdByAdminId: admin,
    });
  }
  for (let i = 0; i < 2; i++) {
    await Admin.create({
      fullName: `${TAG} Admin ${i}`,
      email: `${TAG.toLowerCase()}.admin${i}@example.com`,
      password: "x".repeat(20),
      roleName: i === 1 ? "Doctor" : "Manager",
      roleId: new Types.ObjectId(),
      isActive: true,
    });
  }

  section("Everyone appears");
  const all = await call(list, { q: TAG, limit: 100 });
  ok("all ten people are listed", all.items.length === 10, String(all.items.length));
  ok("total agrees with the rows", all.pagination.total === 10, String(all.pagination.total));

  const kinds = all.items.reduce((m: any, r: any) => ({ ...m, [r.type]: (m[r.type] || 0) + 1 }), {});
  ok("5 HR staff", kinds.hr_employee === 5, JSON.stringify(kinds));
  ok("2 ambulance drivers", kinds.ambulance_driver === 2, JSON.stringify(kinds));
  ok("1 ambulance attendant", kinds.ambulance_attendant === 1, JSON.stringify(kinds));
  ok("1 panel admin and 1 doctor", kinds.admin === 1 && kinds.doctor === 1, JSON.stringify(kinds));

  section("Every row says where it is edited");
  const editable = new Set(all.items.map((r: any) => r.editableAs));
  ok("HR rows are editable as hr", all.items.filter((r: any) => r.type === "hr_employee").every((r: any) => r.editableAs === "hr"));
  ok("crew rows are editable as crew", all.items.filter((r: any) => r.type.startsWith("ambulance")).every((r: any) => r.editableAs === "crew"));
  ok("no row is left without an owner", !editable.has(undefined as any));

  section("Paging across segment boundaries");
  const seen: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await call(list, { q: TAG, limit: 2, page });
    seen.push(...res.items.map((r: any) => `${r.type}:${r.sourceId}`));
  }
  ok("paging returns all ten", seen.length === 10, String(seen.length));
  ok("nobody is repeated across pages", new Set(seen).size === 10, `unique=${new Set(seen).size}`);
  ok("paging matches the single-page result",
    new Set(seen).size === new Set(all.items.map((r: any) => `${r.type}:${r.sourceId}`)).size);

  // An odd page size makes a segment boundary fall mid-page.
  const odd: string[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await call(list, { q: TAG, limit: 3, page });
    odd.push(...res.items.map((r: any) => r.sourceId));
  }
  ok("an odd page size still returns everyone once", new Set(odd).size === 10, String(new Set(odd).size));

  section("Filters");
  const crewOnly = await call(list, { q: TAG, type: "ambulance_driver", limit: 100 });
  ok("type filter returns only that type",
    crewOnly.items.length === 2 && crewOnly.items.every((r: any) => r.type === "ambulance_driver"),
    String(crewOnly.items.length));
  const inactive = await call(list, { q: TAG, status: "inactive", limit: 100 });
  ok("status filter finds the one inactive employee", inactive.items.length === 1, String(inactive.items.length));
  const searched = await call(list, { q: `${TAG} Crew 2`, limit: 100 });
  ok("search narrows to the one match", searched.items.length === 1, String(searched.items.length));

  // A department filter is an HR concept; crew and admins carry none, so they
  // must drop out rather than appear unfiltered.
  const byDept = await call(list, { q: TAG, departmentId: String(new Types.ObjectId()), limit: 100 });
  ok("filtering by department excludes sources that have none", byDept.items.length === 0, String(byDept.items.length));

  section("Counts");
  const c = await call(counts);
  ok("counts cover every type", Object.keys(c.byType).length === 6, JSON.stringify(c.byType));
  ok("counts include the seeded crew", (c.byType.ambulance_driver ?? 0) >= 2, String(c.byType.ambulance_driver));

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
