import { Request, Response, NextFunction } from "express";
import EmrEncounter from "../../models/emr-encounter.model";
import HospitalPatient from "../../models/hospital-patient.model";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";
import { DiagnosticOrder } from "../../models/diagnostic-order.model";

/**
 * Doctor Panel / HMS — EMR (SOAP) encounters.
 *
 * Encounters always belong to a patient and are authored by the logged-in
 * doctor (an Admin user with the Doctor role). Listing is scoped per patient
 * so the UI can render a clinical timeline.
 */

const ENCOUNTER_TYPES = new Set(["OPD", "IPD", "consultation", "emergency"]);

/** GET /admin/emr/patient/:patientId — clinical timeline for one patient. */
export const listByPatient = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const patient = await HospitalPatient.findOne({
    _id: (req.params.patientId as string),
    isDeleted: false,
  }).lean();
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  const encounters = await EmrEncounter.find({ patientId: (req.params.patientId as string) })
    .sort({ visitDate: -1 })
    .populate("doctorId", "fullName email roleName")
    .lean();

  req.rData = { patient, encounters };
  req.msg = "encounter_list";
  return next();
};

/** GET /admin/emr/:id — single encounter. */
export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const encounter = await EmrEncounter.findById(req.params.id)
    .populate("doctorId", "fullName email roleName")
    .populate("patientId", "patientId fullName gender age bloodGroup phone")
    .lean();
  if (!encounter) {
    req.rCode = 5;
    req.msg = "encounter_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { encounter };
  req.msg = "encounter_detail";
  return next();
};

/** POST /admin/emr — create an encounter for a patient. */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  if (!b.patientId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "patientId is required" };
    return next();
  }
  if (b.encounterType && !ENCOUNTER_TYPES.has(b.encounterType)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "encounterType must be OPD | IPD | consultation | emergency" };
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

  const encounter = await EmrEncounter.create({
    patientId: b.patientId,
    doctorId: b.doctorId || adminId, // defaults to the authoring doctor
    encounterType: b.encounterType || "OPD",
    visitDate: b.visitDate ? new Date(b.visitDate) : new Date(),
    chiefComplaint: b.chiefComplaint || undefined,
    vitals: b.vitals || {},
    soap: b.soap || {},
    diagnoses: Array.isArray(b.diagnoses) ? b.diagnoses : [],
    prescriptions: Array.isArray(b.prescriptions) ? b.prescriptions : [],
    labOrders: Array.isArray(b.labOrders) ? b.labOrders : [],
    imagingOrders: Array.isArray(b.imagingOrders) ? b.imagingOrders : [],
    notes: b.notes || undefined,
    status: b.status === "draft" ? "draft" : "finalized",
    createdByAdminId: adminId,
  });

  // Mirror the encounter's lab/imaging orders into the diagnostics tracker
  // so their results/reports can be captured and followed up. Best-effort —
  // a failure here must not fail the encounter.
  try {
    const orders = [
      ...(Array.isArray(b.labOrders) ? b.labOrders : []).map((name: string) => ({
        category: "lab" as const,
        name,
      })),
      ...(Array.isArray(b.imagingOrders) ? b.imagingOrders : []).map(
        (name: string) => ({ category: "imaging" as const, name }),
      ),
    ].filter((o) => o.name && String(o.name).trim());

    if (orders.length) {
      await DiagnosticOrder.insertMany(
        orders.map((o) => ({
          patientId: encounter.patientId,
          encounterId: encounter._id,
          category: o.category,
          name: String(o.name).trim(),
          orderedByAdminId: adminId,
          orderedAt: new Date(),
        })),
      );
    }
  } catch (e) {
    console.error("diagnostic auto-create failed:", e);
  }

  req.rData = { encounter };
  req.msg = "encounter_created";
  return next();
};

/** PUT /admin/emr/:id — update an encounter. */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const encounter = await EmrEncounter.findById(req.params.id);
  if (!encounter) {
    req.rCode = 5;
    req.msg = "encounter_not_found";
    req.rData = {};
    return next();
  }

  if (b.encounterType && !ENCOUNTER_TYPES.has(b.encounterType)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "encounterType must be OPD | IPD | consultation | emergency" };
    return next();
  }

  const fields = [
    "encounterType",
    "chiefComplaint",
    "vitals",
    "soap",
    "diagnoses",
    "prescriptions",
    "labOrders",
    "imagingOrders",
    "notes",
    "status",
  ];
  for (const f of fields) {
    if (b[f] !== undefined) (encounter as any)[f] = b[f];
  }
  if (b.visitDate !== undefined) {
    const d = new Date(b.visitDate);
    if (!Number.isNaN(d.getTime())) encounter.visitDate = d;
  }

  await encounter.save();

  req.rData = { encounter };
  req.msg = "encounter_updated";
  return next();
};

/**
 * POST /admin/emr/:id/dispense — push an encounter's prescriptions into the
 * pharmacy inventory as stock-out movements.
 *
 * For each prescribed drug we match an active medicine in inventory (by name,
 * case-insensitive) and issue the requested quantity (default 1), journalling
 * a StockTransaction. Non-matching or insufficient-stock drugs are skipped and
 * reported back so the dispensing clerk can act on them. Nothing is issued for
 * drugs already out of stock — the operation is best-effort and per-line.
 *
 * body.items (optional): [{ drug, quantity }] overrides the encounter's
 * prescription list (e.g. partial dispense).
 */
export const dispense = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const encounter = await EmrEncounter.findById(req.params.id).lean();
  if (!encounter) {
    req.rCode = 5;
    req.msg = "encounter_not_found";
    req.rData = {};
    return next();
  }

  const requested: { drug: string; quantity: number }[] =
    Array.isArray(req.body?.items) && req.body.items.length
      ? req.body.items.map((i: any) => ({
          drug: String(i.drug || "").trim(),
          quantity: Math.max(1, Number(i.quantity) || 1),
        }))
      : (encounter.prescriptions || []).map((p) => ({
          drug: (p.drug || "").trim(),
          quantity: 1,
        }));

  const results: any[] = [];
  for (const item of requested) {
    if (!item.drug) continue;
    const rx = new RegExp(
      `^${item.drug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    );
    const med = await InventoryItem.findOne({
      category: "medicine",
      isDeleted: false,
      isActive: true,
      name: rx,
    });
    if (!med) {
      results.push({ drug: item.drug, status: "not_found" });
      continue;
    }
    if (med.currentStock < item.quantity) {
      results.push({
        drug: item.drug,
        status: "insufficient",
        available: med.currentStock,
      });
      continue;
    }
    med.currentStock -= item.quantity;
    await med.save();
    await StockTransaction.create({
      itemId: med._id,
      type: "out",
      quantity: item.quantity,
      balanceAfter: med.currentStock,
      reason: "EMR dispense",
      issuedToType: "patient",
      issuedToRef: String(encounter.patientId),
      performedByAdminId: adminId,
    });
    results.push({
      drug: item.drug,
      status: "issued",
      quantity: item.quantity,
      balanceAfter: med.currentStock,
    });
  }

  const issued = results.filter((r) => r.status === "issued").length;
  req.rData = { results, issued, total: results.length };
  req.msg = "stock_adjusted";
  return next();
};
