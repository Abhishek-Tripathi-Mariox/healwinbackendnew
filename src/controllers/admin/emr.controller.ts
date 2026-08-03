import { Request, Response, NextFunction } from "express";
import EmrEncounter from "../../models/emr-encounter.model";
import HospitalPatient from "../../models/hospital-patient.model";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";
import { DiagnosticOrder } from "../../models/diagnostic-order.model";
import { Appointment } from "../../models/appointment.model";
import Admission from "../../models/admission.model";
import { issueFefo } from "../../services/inventory-batch.service";

/**
 * Doctor Panel / HMS — EMR (SOAP) encounters.
 *
 * Encounters always belong to a patient and are authored by the logged-in
 * doctor (an Admin user with the Doctor role). Listing is scoped per patient
 * so the UI can render a clinical timeline.
 */

/**
 * Match prescribed drug names against a patient's free-text known allergies
 * (e.g. "Penicillin, Sulfa drugs, Aspirin"). Simple substring match either
 * direction, case-insensitive — there's no drug-class ontology here (no
 * clinical database backs this), so this catches an exact/named allergy
 * ("Penicillin" prescribed against a "Penicillin" allergy) but NOT drug-class
 * relationships (e.g. Amoxicillin as a penicillin derivative). It's a real
 * safety net for the common case, not a substitute for clinical judgment.
 */
const findAllergyConflicts = (
  allergiesText: string | undefined,
  drugs: string[],
): { drug: string; allergyTerm: string }[] => {
  const terms = String(allergiesText || "")
    .split(/[,;]|\band\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length === 0) return [];

  const conflicts: { drug: string; allergyTerm: string }[] = [];
  for (const drug of drugs) {
    const d = String(drug || "").trim().toLowerCase();
    if (!d) continue;
    const hit = terms.find((t) => {
      const term = t.toLowerCase();
      return d.includes(term) || term.includes(d);
    });
    if (hit) conflicts.push({ drug, allergyTerm: hit });
  }
  return conflicts;
};

const ENCOUNTER_TYPES = new Set(["OPD", "IPD", "consultation", "emergency"]);

/**
 * Plan → follow-up: turn an encounter's `followUpAt` into a real OPD
 * appointment (idempotent — only creates one once per encounter). The
 * appointment shows on the doctor's OPD queue and the patient's Hospital
 * Records, closing the loop on "follow-up visit scheduling".
 */
const scheduleFollowUp = async (encounter: any, adminId: any) => {
  if (!encounter.followUpAt || encounter.followUpAppointmentId) return;
  try {
    const when = new Date(encounter.followUpAt);
    const dayStart = new Date(when); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(when); dayEnd.setHours(23, 59, 59, 999);
    const todays = await Appointment.countDocuments({
      doctorId: encounter.doctorId,
      scheduledAt: { $gte: dayStart, $lte: dayEnd },
    });
    const appt = await Appointment.create({
      patientId: encounter.patientId,
      doctorId: encounter.doctorId,
      scheduledAt: when,
      tokenNumber: todays + 1,
      status: "booked",
      reason: `Follow-up: ${encounter.followUpNotes || encounter.chiefComplaint || "review"}`,
      encounterId: encounter._id,
      createdByAdminId: adminId,
    });
    encounter.followUpAppointmentId = appt._id;
    await encounter.save();
  } catch (e) {
    console.error("follow-up appointment create failed:", e);
  }
};

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
    subjectiveDetail: b.subjectiveDetail || undefined,
    objectiveDetail: b.objectiveDetail || undefined,
    attachments: Array.isArray(b.attachments) ? b.attachments : [],
    diagnoses: Array.isArray(b.diagnoses) ? b.diagnoses : [],
    icdDiagnoses: Array.isArray(b.icdDiagnoses) ? b.icdDiagnoses.filter((d: any) => d?.text) : [],
    severity: b.severity || undefined,
    differentialDiagnoses: Array.isArray(b.differentialDiagnoses) ? b.differentialDiagnoses : [],
    treatmentPlan: b.treatmentPlan || undefined,
    prescriptions: Array.isArray(b.prescriptions) ? b.prescriptions : [],
    procedures: Array.isArray(b.procedures) ? b.procedures : [],
    labOrders: Array.isArray(b.labOrders) ? b.labOrders : [],
    imagingOrders: Array.isArray(b.imagingOrders) ? b.imagingOrders : [],
    referrals: Array.isArray(b.referrals) ? b.referrals : [],
    followUpAt: b.followUpAt ? new Date(b.followUpAt) : undefined,
    followUpNotes: b.followUpNotes || undefined,
    admissionRecommended: !!b.admissionRecommended,
    admissionNote: b.admissionNote || undefined,
    notes: b.notes || undefined,
    status: b.status === "draft" ? "draft" : "finalized",
    createdByAdminId: adminId,
  });

  // Plan → follow-up scheduling: if a follow-up date is set, auto-create an OPD
  // appointment so it lands on the doctor's queue and the patient's record.
  await scheduleFollowUp(encounter, adminId);

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

  const allergyWarnings = findAllergyConflicts(
    patient.healthHistory?.allergies,
    (Array.isArray(b.prescriptions) ? b.prescriptions : []).map((p: any) => p.drug),
  );

  req.rData = { encounter, allergyWarnings };
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
    "subjectiveDetail",
    "objectiveDetail",
    "attachments",
    "diagnoses",
    "icdDiagnoses",
    "severity",
    "differentialDiagnoses",
    "treatmentPlan",
    "prescriptions",
    "procedures",
    "labOrders",
    "imagingOrders",
    "referrals",
    "followUpNotes",
    "admissionRecommended",
    "admissionNote",
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
  if (b.followUpAt !== undefined) {
    encounter.followUpAt = b.followUpAt ? new Date(b.followUpAt) : undefined;
  }

  await encounter.save();
  // Schedule the follow-up appointment if a date was set and none exists yet.
  await scheduleFollowUp(encounter, (req as any).adminId);

  const patient = await HospitalPatient.findById(encounter.patientId).select("healthHistory.allergies").lean();
  const allergyWarnings = findAllergyConflicts(
    (patient as any)?.healthHistory?.allergies,
    (encounter.prescriptions || []).map((p: any) => p.drug),
  );

  req.rData = { encounter, allergyWarnings };
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

  // Allergy safety gate — this is the actual physical-administration moment
  // (unlike the prescribe-time warning in create/update, which is advisory),
  // so a known conflict blocks the dispense outright unless the caller
  // explicitly overrides with a reason, mirroring how real hospital EMRs
  // require an acknowledged override rather than silently allowing it.
  if (!req.body?.overrideAllergyWarning) {
    const patient = await HospitalPatient.findById(encounter.patientId).select("healthHistory.allergies").lean();
    const allergyWarnings = findAllergyConflicts(
      (patient as any)?.healthHistory?.allergies,
      requested.map((r) => r.drug),
    );
    if (allergyWarnings.length > 0) {
      req.rCode = 0;
      req.msg = "allergy_warning";
      req.rData = {
        allergyWarnings,
        hint: "Patient has a recorded allergy that may conflict with this drug. Resubmit with overrideAllergyWarning: true (and a documented reason) to proceed.",
      };
      return next();
    }
  }

  // Bill IPD dispensing against the active admission (matches how billing's
  // pharmacy pull is scoped — see billing.controller.ts#computePharmacyLines
  // — so it's found when a bill is generated/drafted for THIS stay, not
  // mixed into the patient's lifetime OPD total or lost entirely).
  let issuedToRef = String(encounter.patientId);
  if (encounter.encounterType === "IPD") {
    const activeAdmission = await Admission.findOne({
      patientId: encounter.patientId,
      status: "admitted",
    })
      .select("_id")
      .lean();
    if (activeAdmission) issuedToRef = String(activeAdmission._id);
  }

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
    })
      .select("_id currentStock")
      .lean();
    if (!med) {
      results.push({ drug: item.drug, status: "not_found" });
      continue;
    }
    if ((med.currentStock || 0) < item.quantity) {
      results.push({
        drug: item.drug,
        status: "insufficient",
        available: med.currentStock,
      });
      continue;
    }
    // Real FEFO batch draw — same ledger ward issue, ambulance stock and
    // pharmacy-commerce checkout all use, instead of a scalar decrement that
    // bypassed batch/expiry tracking.
    const result = await issueFefo({ itemId: med._id, quantity: item.quantity });
    await StockTransaction.create({
      itemId: med._id,
      type: "out",
      quantity: item.quantity,
      balanceAfter: result.currentStock,
      amount: result.costOfGoodsIssued,
      reason: "EMR dispense",
      issuedToType: "patient",
      issuedToRef,
      performedByAdminId: adminId,
    });
    results.push({
      drug: item.drug,
      status: "issued",
      quantity: item.quantity,
      balanceAfter: result.currentStock,
    });
  }

  const issued = results.filter((r) => r.status === "issued").length;
  req.rData = { results, issued, total: results.length };
  req.msg = "stock_adjusted";
  return next();
};
