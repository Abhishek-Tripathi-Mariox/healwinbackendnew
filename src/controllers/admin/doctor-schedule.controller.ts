import { Request, Response, NextFunction } from "express";
import DoctorSchedule from "../../models/doctor-schedule.model";
import { Admin } from "../../models/admin.model";

/**
 * Admin: manage per-doctor weekly OPD availability. The patient app turns these
 * windows into bookable slots (see services/doctor-slots.service).
 */

const WEEKDAY_OK = (n: any) => Number.isInteger(n) && n >= 0 && n <= 6;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET / — list Doctor-role admins with whether they have a schedule.
export const listDoctors = async (req: Request, _res: Response, next: NextFunction) => {
  const doctors: any[] = await Admin.find({ roleName: "Doctor", isDeleted: false })
    .select("fullName email doctorProfile.speciality")
    .sort({ fullName: 1 })
    .lean();
  const schedules = await DoctorSchedule.find({}).select("doctorId windows isActive slotMinutes").lean();
  const byId = new Map(schedules.map((s: any) => [String(s.doctorId), s]));
  req.rData = {
    items: doctors.map((d) => {
      const s: any = byId.get(String(d._id));
      return {
        _id: String(d._id),
        fullName: d.fullName,
        speciality: d.doctorProfile?.speciality || "",
        hasSchedule: !!s,
        windowCount: s?.windows?.length || 0,
        slotMinutes: s?.slotMinutes || 15,
        isActive: s?.isActive ?? true,
      };
    }),
  };
  req.msg = "success";
  return next();
};

// GET /:doctorId — the doctor's schedule (or an empty default).
export const getSchedule = async (req: Request, _res: Response, next: NextFunction) => {
  const doctorId = req.params.doctorId as string;
  const s: any = await DoctorSchedule.findOne({ doctorId }).lean();
  req.rData = {
    schedule: s
      ? { doctorId: String(s.doctorId), slotMinutes: s.slotMinutes, windows: s.windows, isActive: s.isActive }
      : { doctorId, slotMinutes: 15, windows: [], isActive: true },
  };
  req.msg = "success";
  return next();
};

// PUT /:doctorId — upsert the doctor's schedule.
export const saveSchedule = async (req: Request, _res: Response, next: NextFunction) => {
  const doctorId = req.params.doctorId as string;
  const doctor = await Admin.findOne({ _id: doctorId, roleName: "Doctor", isDeleted: false }).select("_id").lean();
  if (!doctor) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = { hint: "doctor not found" };
    return next();
  }
  const b = req.body || {};
  const slotMinutes = Number(b.slotMinutes) || 15;
  const rawWindows = Array.isArray(b.windows) ? b.windows : [];
  const windows = [];
  for (const w of rawWindows) {
    if (!WEEKDAY_OK(Number(w.weekday)) || !HHMM.test(w.start) || !HHMM.test(w.end) || w.start >= w.end) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = { hint: "each window needs weekday 0-6 and start<end in HH:mm" };
      return next();
    }
    windows.push({ weekday: Number(w.weekday), start: w.start, end: w.end });
  }
  const s = await DoctorSchedule.findOneAndUpdate(
    { doctorId },
    { doctorId, slotMinutes, windows, isActive: b.isActive !== false },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  req.rData = { schedule: s };
  req.msg = "saved";
  return next();
};
