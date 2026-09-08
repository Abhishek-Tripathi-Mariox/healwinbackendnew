import { Request, Response, NextFunction } from "express";
import GeofenceLocation from "../../models/geofence-location.model";
import { EMPLOYEE_CATEGORIES } from "../../models/hr-employee.model";

/**
 * HR — Attendance geofence locations (§4.2, §4.4). Replaces the single
 * hardcoded 0.5 km radius with a per-location, per-category configuration.
 */

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.active === "true") query.isActive = true;
  if (req.query.category) query.$or = [
    { employeeCategories: req.query.category },
    { employeeCategories: { $size: 0 } },
  ];
  const items = await GeofenceLocation.find(query).sort({ name: 1 }).lean();
  req.rData = { items, categories: EMPLOYEE_CATEGORIES };
  req.msg = "success";
  return next();
};

export const save = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const radiusMeters = Number(b.radiusMeters);

  if (!b.name || !String(b.name).trim()) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "name is required" };
    return next();
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "lat must be between -90 and 90" };
    return next();
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "lng must be between -180 and 180" };
    return next();
  }
  // A radius under ~20 m is smaller than consumer GPS error and would mark
  // people outside the fence while they stand inside the building.
  if (!Number.isFinite(radiusMeters) || radiusMeters < 20 || radiusMeters > 20000) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "radiusMeters must be between 20 and 20000" };
    return next();
  }
  const cats: string[] = Array.isArray(b.employeeCategories)
    ? b.employeeCategories.filter((c: string) => EMPLOYEE_CATEGORIES.includes(c as any))
    : [];

  const payload = {
    name: String(b.name).trim(),
    address: b.address,
    lat,
    lng,
    radiusMeters,
    employeeCategories: cats,
    centreId: b.centreId || undefined,
    isActive: b.isActive !== false,
  };
  const id = req.params.id as string;
  const item = id
    ? await GeofenceLocation.findByIdAndUpdate(id, payload, { new: true })
    : await GeofenceLocation.create(payload);
  req.rData = { item };
  req.msg = "saved";
  return next();
};

export const remove = async (req: Request, _res: Response, next: NextFunction) => {
  await GeofenceLocation.findByIdAndDelete(req.params.id as string);
  req.rData = {};
  req.msg = "deleted";
  return next();
};
