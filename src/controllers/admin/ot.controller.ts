import { Request, Response, NextFunction } from "express";
import { OperationTheatre, Surgery } from "../../models/operation-theatre.model";

/** Admin: Operation Theatres + scheduled surgeries. */

/** page/limit off the query string, bounded so a caller can't ask for everything. */
const pageParams = (req: Request, defaultLimit = 20) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || String(defaultLimit), 10)),
  );
  return { page, limit, skip: (page - 1) * limit };
};

// ===== Theatres =====
export const listTheatres = async (req: Request, _res: Response, next: NextFunction) => {
  const { page, limit, skip } = pageParams(req);
  const query = { isDeleted: { $ne: true } };
  const [items, total] = await Promise.all([
    OperationTheatre.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    OperationTheatre.countDocuments(query),
  ]);
  req.rData = { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  req.msg = "success"; return next();
};
export const createTheatre = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.name) { req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "name required" }; return next(); }
  const item = await OperationTheatre.create({ name: b.name, location: b.location });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updateTheatre = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await OperationTheatre.findByIdAndUpdate(
    req.params.id as string,
    { $set: { name: b.name, location: b.location, isActive: b.isActive } },
    { new: true },
  );
  if (!item) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  req.rData = { item }; req.msg = "updated"; return next();
};
export const deleteTheatre = async (req: Request, _res: Response, next: NextFunction) => {
  await OperationTheatre.findByIdAndUpdate(req.params.id as string, { isDeleted: true, isActive: false });
  req.rData = {}; req.msg = "deleted"; return next();
};

// ===== Surgeries =====
export const listSurgeries = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.otId) query.otId = req.query.otId;
  const { page, limit, skip } = pageParams(req);
  const [items, total] = await Promise.all([
    Surgery.find(query)
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("otId", "name")
      .populate("patientId", "fullName patientId phone")
      .populate("surgeonId", "fullName")
      .lean(),
    Surgery.countDocuments(query),
  ]);
  req.rData = { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  req.msg = "success"; return next();
};
export const createSurgery = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.otId || !b.patientId || !b.procedureName || !b.scheduledAt) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "otId, patientId, procedureName, scheduledAt required" };
    return next();
  }
  const scheduledAt = new Date(b.scheduledAt);
  const duration = Number(b.durationMinutes) || 60;
  // Clash guard: same OT must not overlap another non-cancelled surgery.
  const newEnd = new Date(scheduledAt.getTime() + duration * 60000);
  const clash = await Surgery.findOne({
    otId: b.otId,
    status: { $ne: "cancelled" },
    scheduledAt: { $lt: newEnd },
  })
    .sort({ scheduledAt: -1 })
    .lean();
  if (clash) {
    const cEnd = new Date(new Date(clash.scheduledAt).getTime() + (clash.durationMinutes || 60) * 60000);
    if (cEnd > scheduledAt) {
      req.rCode = 0; req.msg = "ot_clash";
      req.rData = { hint: "That OT is already booked for an overlapping time." };
      return next();
    }
  }
  const item = await Surgery.create({
    otId: b.otId, patientId: b.patientId, surgeonId: b.surgeonId || undefined,
    procedureName: b.procedureName, scheduledAt, durationMinutes: duration, notes: b.notes,
  });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updateSurgeryStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toLowerCase();
  const allowed = ["scheduled", "in_progress", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: `status one of ${allowed.join(", ")}` };
    return next();
  }
  const item = await Surgery.findByIdAndUpdate(req.params.id as string, { $set: { status } }, { new: true });
  if (!item) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  req.rData = { item }; req.msg = "updated"; return next();
};
