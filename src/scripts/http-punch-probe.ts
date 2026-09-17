/**
 * Punch in over REAL HTTP, the way the browser does it.
 *
 * The controller tests call handlers directly and so never exercise the
 * request/body-parsing layer — which is exactly where punch-in broke: the
 * client forced `Content-Type: application/json` onto a multipart body.
 *
 * Usage: set up → print token, then curl against a running server, then
 *        npx ts-node --files src/scripts/http-punch-probe.ts cleanup
 */
import mongoose, { Types } from "mongoose";
import jwt from "jsonwebtoken";
import config from "../config";
import { Admin, AdminSession } from "../models/admin.model";
import Role from "../models/role.model";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";

const TAG = "HTTP-PUNCH";

const run = async () => {
  await mongoose.connect(config.database.url);
  const mode = process.argv[2] || "setup";

  const cleanup = async () => {
    const admins = await Admin.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
    const ids = admins.map((a: any) => a._id);
    const emps = await HrEmployee.find({ linkedAdminId: { $in: ids } }).select("_id").lean();
    await Attendance.deleteMany({ employeeId: { $in: emps.map((e: any) => e._id) } });
    await HrEmployee.deleteMany({ linkedAdminId: { $in: ids } });
    await AdminSession.deleteMany({ adminId: { $in: ids } });
    await Admin.deleteMany({ _id: { $in: ids } });
  };

  if (mode === "cleanup") {
    await cleanup();
    console.log("cleaned");
  } else {
    await cleanup();
    const role: any = await Role.findOne({ isActive: true }).lean();
    const admin: any = await Admin.create({
      fullName: `${TAG} User`, email: `${TAG.toLowerCase()}@example.com`,
      password: "x".repeat(20), roleId: role._id, roleName: role.name, isActive: true,
    });
    await HrEmployee.create({
      employeeCode: `${TAG}-1`, fullName: `${TAG} User`,
      joiningDate: new Date(2024, 0, 1), status: "active", isDeleted: false,
      linkedAdminId: admin._id, createdByAdminId: new Types.ObjectId(),
    });
    const token = jwt.sign(
      { adminId: admin._id, roleId: admin.roleId, roleName: admin.roleName },
      config.auth.jwtSecret,
      { expiresIn: "1h" },
    );
    await AdminSession.create({
      adminId: admin._id, token, isActive: true,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    console.log(token);
  }
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
