import { Request, Response, NextFunction } from "express";
import EmrEncounter from "../../models/emr-encounter.model";
import HospitalPatient from "../../models/hospital-patient.model";
import { DiagnosticOrder } from "../../models/diagnostic-order.model";
import { Appointment } from "../../models/appointment.model";
import InventoryItem from "../../models/inventory-item.model";
import LabTest from "../../models/lab-test.model";
import PharmacyProduct from "../../models/pharmacy-product.model";
import PharmacyDispense from "../../models/pharmacy-dispense.model";
import Admission from "../../models/admission.model";
import { appendToOpenInvoice } from "./billing.controller";

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
/**
 * Exported so the pharmacy dispense queue can run the SAME check at hand-over
 * time — that is the moment the drug physically reaches the patient, and it
 * must not be possible to bypass it by dispensing from the queue instead of
 * the encounter.
 */
export const findAllergyConflicts = (
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

  // Prescriptions → the pharmacy counter's dispense queue. Only for finalized
  // encounters: a draft is still being written, and the pharmacy must not start
  // handing out medicine the doctor hasn't committed to. Best-effort, same as
  // diagnostics — a pharmacy failure must not lose the clinical record.
  try {
    const rx = (Array.isArray(b.prescriptions) ? b.prescriptions : []).filter(
      (p: any) => p?.drug && String(p.drug).trim(),
    );
    if (rx.length && encounter.status === "finalized") {
      await PharmacyDispense.create({
        patientId: encounter.patientId,
        encounterId: encounter._id,
        doctorId: encounter.doctorId,
        lines: rx.map((p: any) => ({
          itemId: p.itemId || undefined,
          drug: String(p.drug).trim(),
          dosage: p.dosage || undefined,
          frequency: p.frequency || undefined,
          duration: p.duration || undefined,
          notes: p.notes || undefined,
          quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1,
          dispensedQuantity: 0,
        })),
        status: "pending",
        createdByAdminId: adminId,
      });
    }
  } catch (e) {
    console.error("pharmacy dispense auto-create failed:", e);
  }

  // Procedures performed during the visit are billable — put them on the
  // patient's open bill as soon as the encounter is finalised, rather than
  // waiting for someone to click Generate. The consultation fee is NOT added
  // here: OPD already raises it at booking, and adding it again would
  // double-charge. Stamped so generate() cannot pull them a second time.
  try {
    const procs = (Array.isArray(b.procedures) ? b.procedures : []).filter(
      (p: any) => p?.name && Number(p.price) > 0,
    );
    if (procs.length && encounter.status === "finalized") {
      const active: any =
        encounter.encounterType === "IPD"
          ? await Admission.findOne({
              patientId: encounter.patientId,
              status: "admitted",
            })
              .select("_id")
              .lean()
          : null;
      const invoice = await appendToOpenInvoice({
        patientId: encounter.patientId,
        admissionId: active?._id,
        encounterId: encounter._id,
        doctorId: encounter.doctorId,
        adminId,
        lines: procs.map((p: any) => ({
          section: "procedure" as const,
          description: p.name,
          quantity: 1,
          unitPrice: Number(p.price),
          amount: Number(p.price),
        })),
      });
      if (invoice) {
        await EmrEncounter.updateOne(
          { _id: encounter._id },
          { $set: { proceduresInvoiceId: invoice._id } },
        );
      }
    }
  } catch (e) {
    console.error("procedure auto-bill failed:", e);
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
 * GET /admin/emr/drug-options — medicine picker for the prescription rows.
 *
 * Unions the two places medicine actually lives, because either can be the
 * populated one depending on how the hospital was set up:
 *
 *   • InventoryItem (category "medicine") — real HMS stock with FEFO batches.
 *     Dispensable: the pharmacy queue decrements it on hand-over.
 *   • PharmacyProduct — the patient-app catalogue. Dispensable only when it
 *     carries `itemId` (linked to an inventory item on the Catalog screen);
 *     otherwise it is prescribable by name but nothing is decremented.
 *
 * A catalogue product linked to an inventory item is returned once, as the
 * inventory row, so the doctor never sees the same drug twice.
 */
export const drugOptions = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const search = ((req.query.search as string) || "").trim();
  const rx = search
    ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;

  const invQuery: any = { isDeleted: false, isActive: true, category: "medicine" };
  if (rx) invQuery.$or = [{ name: rx }, { sku: rx }];

  const prodQuery: any = { isDeleted: { $ne: true }, isActive: true };
  if (rx) prodQuery.$or = [{ name: rx }, { brand: rx }, { category: rx }];

  const [invItems, products] = await Promise.all([
    InventoryItem.find(invQuery).select("name sku unit currentStock").sort({ name: 1 }).limit(25).lean(),
    PharmacyProduct.find(prodQuery).select("name brand stock itemId").sort({ name: 1 }).limit(25).lean(),
  ]);

  const items: any[] = invItems.map((it: any) => ({
    key: `hms-${it._id}`,
    itemId: String(it._id), // dispensable from hospital stock
    name: it.name,
    sub: it.sku || "",
    unit: it.unit || "",
    currentStock: it.currentStock ?? 0,
    source: "hms",
  }));

  // Skip catalogue products already represented by their linked inventory row.
  const seenItemIds = new Set(items.map((i) => i.itemId));
  for (const p of products as any[]) {
    if (p.itemId && seenItemIds.has(String(p.itemId))) continue;
    items.push({
      key: `cat-${p._id}`,
      itemId: p.itemId ? String(p.itemId) : undefined,
      name: p.name,
      sub: p.brand || "",
      unit: "",
      currentStock: p.stock ?? 0,
      source: p.itemId ? "hms" : "catalog",
    });
  }

  items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  req.rData = { items: items.slice(0, 25) };
  req.msg = "success";
  return next();
};

/**
 * GET /admin/emr/lab-test-options — lab/imaging picker for ordering tests.
 * Sourced from the LabTest catalogue so orders carry real, consistent names
 * (the diagnostics tracker keys off the name).
 */
export const labTestOptions = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const search = ((req.query.search as string) || "").trim();
  const query: any = { isDeleted: false, isActive: true };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { category: rx }];
  }
  const items = await LabTest.find(query)
    .select("name category price sampleType reportHours")
    .sort({ name: 1 })
    .limit(25)
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
