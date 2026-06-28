import { Request, Response, NextFunction } from "express";
import { OperationTheatre, Surgery } from "../../models/operation-theatre.model";

/** Admin: Operation Theatres + scheduled surgeries. */

// ===== Theatres =====
export const listTheatres = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await OperationTheatre.find({ isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
  req.rData = { items }; req.msg = "success"; return next();
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
  const items = await Surgery.find(query)
    .sort({ scheduledAt: -1 })
    .limit(200)
    .populate("otId", "name")
    .populate("patientId", "fullName patientId phone")
    .populate("surgeonId", "fullName")
    .lean();
  req.rData = { items }; req.msg = "success"; return next();
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
