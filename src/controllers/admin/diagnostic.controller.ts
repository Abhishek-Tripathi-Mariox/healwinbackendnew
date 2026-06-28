import { Request, Response, NextFunction } from "express";
import { DiagnosticOrder } from "../../models/diagnostic-order.model";
import { HospitalPatient } from "../../models/hospital-patient.model";
import { uploadFileToAws } from "../../utils/s3";
import { notifyHospitalPatient } from "../../services/hms-notify.service";

const CATEGORIES = new Set(["lab", "imaging"]);
const STATUSES = new Set(["ordered", "collected", "reported"]);

/**
 * List diagnostic orders, optionally scoped to a patient / encounter /
 * category / status. Newest first.
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  const { patientId, encounterId, category, status } = req.query as Record<
    string,
    string
  >;
  const filter: Record<string, unknown> = {};
  if (patientId) filter.patientId = patientId;
  if (encounterId) filter.encounterId = encounterId;
  if (category) filter.category = category;
  if (status) filter.status = status;

  const items = await DiagnosticOrder.find(filter)
    .sort({ createdAt: -1 })
    .populate("orderedByAdminId", "name")
    .populate("reportedByAdminId", "name");

  req.rData = { items };
  req.msg = "diagnostics_listed";
  return next();
};

/**
 * Raise a new lab/imaging order for a patient.
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  if (!b.patientId || !b.name || !CATEGORIES.has(b.category)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "patientId, name and category (lab|imaging) are required" };
    return next();
  }

  const patient = await HospitalPatient.findOne({
    _id: b.patientId,
    isDeleted: false,
  }).lean();
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  const order = await DiagnosticOrder.create({
    patientId: b.patientId,
    encounterId: b.encounterId || undefined,
    admissionId: b.admissionId || undefined,
    category: b.category,
    name: String(b.name).trim(),
    orderedByAdminId: adminId,
    orderedAt: new Date(),
  });

  req.rData = { order };
  req.msg = "diagnostic_created";
  return next();
};

/**
 * Update an order — advance status and/or record the result. Setting a
 * result (or status "reported") stamps reportedBy/reportedAt.
 */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  const order = await DiagnosticOrder.findById(req.params.id);
  if (!order) {
    req.rCode = 5;
    req.msg = "diagnostic_not_found";
    req.rData = {};
    return next();
  }

  if (b.status && !STATUSES.has(b.status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "status must be ordered | collected | reported" };
    return next();
  }

  if (typeof b.resultValue === "string") order.resultValue = b.resultValue;
  if (typeof b.resultNotes === "string") order.resultNotes = b.resultNotes;
  if (b.status) order.status = b.status;

  // Recording any result implies the report is in.
  const hasResult =
    (order.resultValue && order.resultValue.trim()) ||
    order.attachments.length > 0 ||
    b.status === "reported";
  if (hasResult) {
    order.status = "reported";
    order.reportedByAdminId = adminId;
    order.reportedAt = new Date();
  }

  await order.save();

  // Tell the patient their report is ready (app → Hospital Records → Lab).
  if (hasResult) {
    void notifyHospitalPatient(
      order.patientId,
      "Report ready",
      `Your ${order.category === "imaging" ? "imaging" : "lab"} report for "${order.name}" is ready to view.`,
      { tab: "lab" },
    );
  }

  req.rData = { order };
  req.msg = "diagnostic_updated";
  return next();
};

/**
 * Attach a report file (PDF / scan / image) to an order. Marks it reported.
 */
export const addAttachment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const order = await DiagnosticOrder.findById(req.params.id);
  if (!order) {
    req.rCode = 5;
    req.msg = "diagnostic_not_found";
    req.rData = {};
    return next();
  }

  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "file is required" };
    return next();
  }

  const { images: url } = await uploadFileToAws([file]);
  order.attachments.push({
    url: url as string,
    label: req.body.label || file.originalname,
    uploadedAt: new Date(),
  });
  order.status = "reported";
  order.reportedByAdminId = adminId;
  order.reportedAt = new Date();
  await order.save();

  req.rData = { order };
  req.msg = "diagnostic_report_added";
  return next();
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const order = await DiagnosticOrder.findByIdAndDelete(req.params.id);
  if (!order) {
    req.rCode = 5;
    req.msg = "diagnostic_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { message: "Diagnostic order deleted" };
  req.msg = "diagnostic_deleted";
  return next();
};
