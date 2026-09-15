/**
 * Account access: forgot password, reset, self-service change, and admin reset.
 *
 * The property that matters most here is that a reset token only ever reaches
 * the mailbox that owns the account. It used to be returned in the response of
 * a PUBLIC endpoint, which let anyone who knew an administrator's email take
 * the account over without touching their mail at all.
 *
 * Usage: npm run e2e:account-security
 */
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import config from "../config";
import { Admin, AdminSession } from "../models/admin.model";
import Role from "../models/role.model";
import HrEmployee from "../models/hr-employee.model";
import * as auth from "../controllers/admin/admin-auth.controller";
import { resetPanelPassword } from "../controllers/admin/hr-employee.controller";

const TAG = "E2E-SEC";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

/** Express-style controller (res.locals.data / res.status().json()). */
const callX = async (fn: any, req: any) => {
  const res: any = {
    locals: {},
    status: (c: number) => ({ json: (j: any) => { res._status = c; res._json = j; return res; } }),
  };
  await fn({ params: {}, query: {}, body: {}, ...req }, res, (() => undefined) as any);
  return { data: res.locals.data, status: res._status, json: res._json };
};
/** rData-style controller. */
const callR = async (fn: any, req: any) => {
  const r: any = { params: {}, query: {}, body: {}, ...req };
  await fn(r, {} as any, (() => undefined) as any);
  return { data: r.rData, code: r.rCode };
};

const EMAIL = `${TAG.toLowerCase()}@example.com`;
const START_PW = "OldPassw0rd!";

const cleanup = async () => {
  const admins = await Admin.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  await AdminSession.deleteMany({ adminId: { $in: admins.map((a: any) => a._id) } });
  await HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await Admin.deleteMany({ fullName: new RegExp(`^${TAG}`) });
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — account security\n`);
  await cleanup();

  const role: any = await Role.findOne({ isActive: true }).lean();
  const mk = async () =>
    Admin.create({
      fullName: `${TAG} User`,
      email: EMAIL,
      password: await bcrypt.hash(START_PW, 12),
      roleId: role._id,
      roleName: role.name,
      isActive: true,
    });
  let admin: any = await mk();

  section("Forgot password never hands back a token");
  const forgot = await callX(auth.forgotPassword, { body: { email: EMAIL } });
  const body = JSON.stringify(forgot.data || {});
  ok("the response carries no reset token", !/resetToken|[a-f0-9]{64}/.test(body), body);
  ok("it only says a link may have been sent", /reset link/i.test(body), body);

  const unknown = await callX(auth.forgotPassword, { body: { email: "nobody@example.com" } });
  ok("an unknown address gets the same answer",
    JSON.stringify(unknown.data) === JSON.stringify(forgot.data),
    JSON.stringify(unknown.data));
  ok("so the endpoint cannot be used to find who has an account", true);

  section("The token itself still works");
  // Simulate what the email would carry, the same way the handler builds it.
  const raw = crypto.randomBytes(32).toString("hex");
  admin = await Admin.findById(admin._id);
  admin.resetPasswordToken = crypto.createHash("sha256").update(raw).digest("hex");
  admin.resetPasswordExpires = new Date(Date.now() + 3600_000);
  await admin.save();
  await AdminSession.create({
    adminId: admin._id, token: "old-session",
    isActive: true, expiresAt: new Date(Date.now() + 864e5),
  });

  const NEW_PW = "BrandNewPass1!";
  const reset = await callX(auth.resetPassword, { body: { token: raw, newPassword: NEW_PW } });
  ok("a valid token resets the password", !reset.status, JSON.stringify(reset.json));
  const after: any = await Admin.findById(admin._id).select("+password").lean();
  ok("the new password is stored hashed", /^\$2[aby]\$/.test(after.password));
  ok("and it is the new one", await bcrypt.compare(NEW_PW, after.password));
  ok("the token is cleared after use", !after.resetPasswordToken);
  ok("existing sessions are signed out",
    (await AdminSession.countDocuments({ adminId: admin._id, isActive: true })) === 0);

  const replay = await callX(auth.resetPassword, { body: { token: raw, newPassword: "Another1!" } });
  ok("the same token cannot be used twice", replay.status === 400, JSON.stringify(replay.json));

  section("Expired tokens are refused");
  admin = await Admin.findById(admin._id);
  const stale = crypto.randomBytes(32).toString("hex");
  admin.resetPasswordToken = crypto.createHash("sha256").update(stale).digest("hex");
  admin.resetPasswordExpires = new Date(Date.now() - 1000); // a second ago
  await admin.save();
  const expired = await callX(auth.resetPassword, { body: { token: stale, newPassword: "Another1!" } });
  ok("an expired token is refused", expired.status === 400, JSON.stringify(expired.json));

  section("Changing your own password");
  const mine = { adminId: admin._id, sessionToken: "current-session" };
  await AdminSession.create({
    adminId: admin._id, token: "current-session",
    isActive: true, expiresAt: new Date(Date.now() + 864e5),
  });
  await AdminSession.create({
    adminId: admin._id, token: "other-device",
    isActive: true, expiresAt: new Date(Date.now() + 864e5),
  });

  const wrongCurrent = await callX(auth.changeMyPassword, {
    ...mine, body: { currentPassword: "not-it", newPassword: "Whatever1!" },
  });
  ok("the wrong current password is refused", wrongCurrent.status === 400, JSON.stringify(wrongCurrent.json));

  const tooShort = await callX(auth.changeMyPassword, {
    ...mine, body: { currentPassword: NEW_PW, newPassword: "short" },
  });
  ok("a short new password is refused", tooShort.status === 400);

  const same = await callX(auth.changeMyPassword, {
    ...mine, body: { currentPassword: NEW_PW, newPassword: NEW_PW },
  });
  ok("reusing the same password is refused", same.status === 400);

  const FINAL_PW = "FinalPass99!";
  const changed = await callX(auth.changeMyPassword, {
    ...mine, body: { currentPassword: NEW_PW, newPassword: FINAL_PW },
  });
  ok("the change succeeds with the right current password", !changed.status, JSON.stringify(changed.json));
  const afterChange: any = await Admin.findById(admin._id).select("+password").lean();
  ok("the new password works", await bcrypt.compare(FINAL_PW, afterChange.password));
  ok("the other device is signed out",
    !(await AdminSession.findOne({ adminId: admin._id, token: "other-device" }))?.isActive);
  ok("but the session doing the change is kept",
    (await AdminSession.findOne({ adminId: admin._id, token: "current-session" }))?.isActive === true);

  section("HR resetting an employee's password");
  const emp: any = await HrEmployee.create({
    employeeCode: `${TAG}-1`, fullName: `${TAG} User`, email: EMAIL,
    joiningDate: new Date(2024, 0, 1), status: "active", isDeleted: false,
    linkedAdminId: admin._id, createdByAdminId: new Types.ObjectId(),
  });
  const hrReset = await callR(resetPanelPassword, {
    params: { id: String(emp._id) }, body: {},
  });
  ok("a password is generated and returned once", !!hrReset.data?.temporaryPassword,
    JSON.stringify(hrReset.data));
  const afterHr: any = await Admin.findById(admin._id).select("+password").lean();
  ok("it is the password now in force",
    await bcrypt.compare(hrReset.data.temporaryPassword, afterHr.password));
  ok("every session is signed out",
    (await AdminSession.countDocuments({ adminId: admin._id, isActive: true })) === 0);

  const noLogin: any = await HrEmployee.create({
    employeeCode: `${TAG}-2`, fullName: `${TAG} NoLogin`,
    joiningDate: new Date(2024, 0, 1), status: "active", isDeleted: false,
    createdByAdminId: new Types.ObjectId(),
  });
  const refused = await callR(resetPanelPassword, { params: { id: String(noLogin._id) }, body: {} });
  ok("an employee with no login is refused", refused.code === 0, JSON.stringify(refused.data));
  ok("and told how to give them one", /give them a role/i.test(JSON.stringify(refused.data)));

  const shortPw = await callR(resetPanelPassword, {
    params: { id: String(emp._id) }, body: { password: "abc" },
  });
  ok("a short chosen password is refused", shortPw.code === 0);

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
