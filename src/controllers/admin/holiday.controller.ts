import { Request, Response, NextFunction } from "express";
import { Holiday } from "../../models/holiday.model";

/**
 * HR — Holiday calendar. Days listed here are excluded from absent/LOP
 * calculations elsewhere in HR.
 */

const dayStart = (input: string | Date): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const year = parseInt(
    (req.query.year as string) || String(new Date().getFullYear()),
    10,
  );
  const items = await Holiday.find({ year }).sort({ date: 1 }).lean();
  req.rData = { year, items };
  req.msg = "holiday_list";
  return next();
};

export const save = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.name || !b.date) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name and date are required" };
    return next();
  }
  const date = dayStart(b.date);
  const payload = {
    name: b.name,
    date,
    year: date.getFullYear(),
    type: b.type || "public",
    isActive: b.isActive !== false,
  };
  const item = (req.params.id as string)
    ? await Holiday.findByIdAndUpdate(req.params.id, payload, { new: true })
    : await Holiday.create(payload);

  req.rData = { item };
  req.msg = "holiday_saved";
  return next();
};

export const remove = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const item = await Holiday.findByIdAndDelete(req.params.id);
  if (!item) {
    req.rCode = 5;
    req.msg = "holiday_not_found";
    req.rData = {};
    return next();
  }
  req.rData = {};
  req.msg = "holiday_deleted";
  return next();
};
