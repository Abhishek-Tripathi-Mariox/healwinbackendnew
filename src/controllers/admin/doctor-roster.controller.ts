import { Request, Response, NextFunction } from "express";
import DoctorRoster from "../../models/doctor-roster.model";

/** Admin: doctor duty roster / on-call schedule. */

const SHIFTS = new Set(["morning", "evening", "night", "full"]);

// GET /?date=YYYY-MM-DD (or ?from&to) — roster entries.
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.date) query.date = req.query.date;
  else if (req.query.from && req.query.to) query.date = { $gte: req.query.from, $lte: req.query.to };
  if (req.query.doctorId) query.doctorId = req.query.doctorId;
  const items = await DoctorRoster.find(query)
    .sort({ date: 1, shift: 1 })
    .limit(500)
    .populate("doctorId", "fullName doctorProfile.speciality")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

// POST / — add a roster entry (upsert on doctor+date+shift to avoid duplicates).
export const create = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.doctorId || !b.date || !SHIFTS.has(b.shift)) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "doctorId, date (YYYY-MM-DD) and shift required" };
    return next();
  }
  const item = await DoctorRoster.findOneAndUpdate(
    { doctorId: b.doctorId, date: b.date, shift: b.shift },
    { $set: { isOnCall: !!b.isOnCall, department: b.department, notes: b.notes } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  req.rData = { item };
  req.msg = "saved";
  return next();
};

// DELETE /:id — remove a roster entry.
export const remove = async (req: Request, _res: Response, next: NextFunction) => {
  await DoctorRoster.findByIdAndDelete(req.params.id as string);
  req.rData = {};
  req.msg = "deleted";
  return next();
};
