import { Request, Response, NextFunction } from "express";
import { Admin } from "../../models/admin.model";
import HrEmployee from "../../models/hr-employee.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import Driver from "../../models/driver.model";
import Attendance from "../../models/attendance.model";

/**
 * Unified staff directory — one read-only view of EVERY person across the
 * platform regardless of which subsystem owns them (panel admins/doctors, HR
 * employees, ambulance crew, ride drivers). Each row carries its source `type`
 * + `sourceId` so other modules can link back. This is the bridge that makes
 * "all roles in one place" true without a risky data migration.
 */

interface DirectoryRow {
  type: "admin" | "doctor" | "hr_employee" | "ambulance_driver" | "ambulance_attendant" | "ride_driver";
  sourceId: string;
  name: string;
  contact: string;
  role: string;
  status: string;
}

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const typeFilter = (req.query.type as string) || "";
  const q = ((req.query.q as string) || "").trim().toLowerCase();

  const [admins, employees, crew, drivers] = await Promise.all([
    Admin.find({ isDeleted: { $ne: true } })
      .select("fullName email phone roleName isActive doctorProfile.speciality")
      .lean(),
    HrEmployee.find({ isDeleted: { $ne: true } })
      .select("fullName employeeCode email phone status designationId")
      .populate("designationId", "name")
      .lean(),
    AmbulanceStaff.find({ isDeleted: { $ne: true } })
      .select("fullName mobileNumber role isActive")
      .lean(),
    Driver.find({ isDeleted: { $ne: true } })
      .select("fullName mobileNumber status isActive")
      .lean(),
  ]);

  const rows: DirectoryRow[] = [];

  for (const a of admins as any[]) {
    const isDoctor = a.roleName === "Doctor";
    rows.push({
      type: isDoctor ? "doctor" : "admin",
      sourceId: String(a._id),
      name: a.fullName,
      contact: a.email || a.phone || "",
      role: isDoctor ? a.doctorProfile?.speciality || "Doctor" : a.roleName || "Admin",
      status: a.isActive ? "active" : "inactive",
    });
  }
  for (const e of employees as any[]) {
    rows.push({
      type: "hr_employee",
      sourceId: String(e._id),
      name: e.fullName,
      contact: e.phone || e.email || e.employeeCode || "",
      role: e.designationId?.name || "Employee",
      status: e.status || "active",
    });
  }
  for (const s of crew as any[]) {
    rows.push({
      type: s.role === "attendant" ? "ambulance_attendant" : "ambulance_driver",
      sourceId: String(s._id),
      name: s.fullName,
      contact: s.mobileNumber || "",
      role: s.role === "attendant" ? "Ambulance Attendant" : "Ambulance Driver",
      status: s.isActive ? "active" : "inactive",
    });
  }
  for (const d of drivers as any[]) {
    rows.push({
      type: "ride_driver",
      sourceId: String(d._id),
      name: d.fullName,
      contact: d.mobileNumber || "",
      role: "Ride Driver",
      status: d.isActive === false ? "inactive" : d.status || "active",
    });
  }

  let items = rows;
  if (typeFilter) items = items.filter((r) => r.type === typeFilter);
  if (q) items = items.filter((r) => r.name?.toLowerCase().includes(q) || r.contact?.toLowerCase().includes(q));
  items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Counts by type (for the directory's summary chips).
  const counts: Record<string, number> = {};
  rows.forEach((r) => { counts[r.type] = (counts[r.type] || 0) + 1; });

  req.rData = { items, total: items.length, counts };
  req.msg = "success";
  return next();
};

/**
 * GET /attendance?date=YYYY-MM-DD — ambulance crew present/absent for a day,
 * derived from the central Attendance rows auto-written on duty toggle.
 */
export const attendance = async (req: Request, _res: Response, next: NextFunction) => {
  const dateStr = (req.query.date as string) || "";
  const day = dateStr ? new Date(dateStr) : new Date();
  day.setHours(0, 0, 0, 0);
  const crew: any[] = await AmbulanceStaff.find({ isDeleted: { $ne: true } })
    .select("fullName mobileNumber role")
    .sort({ fullName: 1 })
    .lean();
  const rows: any[] = await Attendance.find({ subjectType: "ambulance_staff", date: day }).lean();
  const byId = new Map(rows.map((r) => [String(r.ambulanceStaffId), r]));
  const items = crew.map((s) => {
    const a: any = byId.get(String(s._id));
    return {
      staffId: String(s._id),
      name: s.fullName,
      role: s.role === "attendant" ? "Attendant" : "Driver",
      mobile: s.mobileNumber || "",
      status: a?.status || "absent",
      checkIn: a?.checkIn || "",
      checkOut: a?.checkOut || "",
    };
  });
  const present = items.filter((i) => i.status === "present").length;
  req.rData = { date: day.toISOString().slice(0, 10), present, total: items.length, items };
  req.msg = "success";
  return next();
};
