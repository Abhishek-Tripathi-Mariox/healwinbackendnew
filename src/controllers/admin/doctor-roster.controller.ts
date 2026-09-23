import { Request, Response, NextFunction } from "express";
import DoctorRoster from "../../models/doctor-roster.model";

/** Admin: doctor duty roster / on-call schedule. */

const SHIFTS = new Set(["morning", "evening", "night", "full"]);

// GET /?date=YYYY-MM-DD (or ?from&to) — roster entries.
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.date) {
    query.date = req.query.date;
  } else if (req.query.from && req.query.to) {
    // An inverted range (from after to) matches nothing, and reads as "no
    // roster" rather than as a mistake. Dates are YYYY-MM-DD, so ordering them
    // as strings is ordering them as dates.
    let from = String(req.query.from);
    let to = String(req.query.to);
    if (from > to) [from, to] = [to, from];
    query.date = { $gte: from, $lte: to };
  }
  if (req.query.doctorId) query.doctorId = req.query.doctorId;
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "25", 10)),
  );
  const [items, total] = await Promise.all([
    DoctorRoster.find(query)
      .sort({ date: 1, shift: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("doctorId", "fullName doctorProfile.speciality")
      .lean(),
    DoctorRoster.countDocuments(query),
  ]);
  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
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
