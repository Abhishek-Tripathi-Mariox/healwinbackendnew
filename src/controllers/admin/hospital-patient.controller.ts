import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import HospitalPatient from "../../models/hospital-patient.model";
import { nextSequence } from "../../models/counter.model";
import { uploadFileToAws } from "../../utils/s3";
import Admission from "../../models/admission.model";
import Appointment from "../../models/appointment.model";
import EmrEncounter from "../../models/emr-encounter.model";
import HospitalInvoice from "../../models/hospital-invoice.model";
import DiagnosticOrder from "../../models/diagnostic-order.model";
import { PatientPolicy, InsuranceClaim } from "../../models/insurance.model";
import { AmbulanceStockTransaction } from "../../models/ambulance-stock.model";
import BillingAudit from "../../models/billing-audit.model";
import { Surgery } from "../../models/operation-theatre.model";
import AmbulanceRequest from "../../models/ambulance-request.model";
import { EmergencyDispatch } from "../../models/emergency-dispatch.model";
import StockTransaction from "../../models/stock-transaction.model";

/**
 * Doctor Panel / HMS — Patient Registration & Demographics CRUD.
 *
 * Response convention follows the rest of the admin API: controllers set
 * `req.rData` / `req.rCode` / `req.msg` and call `next()`; ResponseMiddleware
 * serializes the envelope.
 */

const GENDERS = new Set(["male", "female", "other"]);

/** Mints the next human-readable patient id, e.g. HWP-000123. */
const mintPatientId = async (): Promise<string> => {
  const seq = await nextSequence("hospital_patient");
  return `HWP-${String(seq).padStart(6, "0")}`;
};

/** Derives age (years) from a date of birth. */
const ageFromDob = (dob: Date): number => {
  const diff = Date.now() - dob.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const search = ((req.query.search as string) || "").trim();

  const query: any = { isDeleted: false };
  if (req.query.status === "inactive") query.isActive = false;
  else if (req.query.status === "active") query.isActive = true;

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ fullName: rx }, { patientId: rx }, { phone: rx }];
  }

  const [items, total] = await Promise.all([
    HospitalPatient.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    HospitalPatient.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "patient_list";
  return next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const patient = await HospitalPatient.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  }).lean();

  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  req.rData = { patient };
  req.msg = "patient_detail";
  return next();
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  if (!b.fullName || !b.phone || !b.gender) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "fullName, phone and gender are required" };
    return next();
  }
  if (!GENDERS.has(b.gender)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "gender must be male | female | other" };
    return next();
  }

  const dob = b.dateOfBirth ? new Date(b.dateOfBirth) : undefined;
  const age =
    b.age != null && b.age !== ""
      ? Number(b.age)
      : dob && !Number.isNaN(dob.getTime())
        ? ageFromDob(dob)
        : undefined;

  const patient = await HospitalPatient.create({
    patientId: await mintPatientId(),
    fullName: b.fullName,
    gender: b.gender,
    dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : undefined,
    age,
    bloodGroup: b.bloodGroup || "unknown",
    phone: b.phone,
    email: b.email || undefined,
    address: b.address || undefined,
    photo: b.photo || undefined,
    emergencyContacts: Array.isArray(b.emergencyContacts)
      ? b.emergencyContacts
      : [],
    healthHistory: b.healthHistory || {},
    registeredByAdminId: adminId,
  });

  req.rData = { patient };
  req.msg = "patient_created";
  return next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const patient = await HospitalPatient.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  if (b.gender && !GENDERS.has(b.gender)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "gender must be male | female | other" };
    return next();
  }

  const fields = [
    "fullName",
    "gender",
    "bloodGroup",
    "phone",
    "email",
    "address",
    "photo",
    "emergencyContacts",
    "healthHistory",
    "isActive",
  ];
  for (const f of fields) {
    if (b[f] !== undefined) (patient as any)[f] = b[f];
  }

  if (b.dateOfBirth !== undefined) {
    const dob = b.dateOfBirth ? new Date(b.dateOfBirth) : undefined;
    patient.dateOfBirth = dob && !Number.isNaN(dob.getTime()) ? dob : undefined;
    if (patient.dateOfBirth) patient.age = ageFromDob(patient.dateOfBirth);
  }
  if (b.age !== undefined && b.age !== "") patient.age = Number(b.age);

  await patient.save();

  req.rData = { patient };
  req.msg = "patient_updated";
  return next();
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const patient = await HospitalPatient.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }
  patient.isDeleted = true;
  patient.isActive = false;
  await patient.save();

  req.rData = {};
  req.msg = "patient_deleted";
  return next();
};

/**
 * Upload a supporting document (id proof, insurance, report) or photograph.
 * multipart/form-data: file = <binary>, type, label, asPhoto ("true" to set
 * the patient's photo instead of appending to documents[]).
 */
export const addDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const patient = await HospitalPatient.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
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

  if (String(req.body.asPhoto) === "true") {
    patient.photo = url as string;
  } else {
    const mimeType = String(file.mimetype || "");
    const autoType = mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("image/")
        ? "photo"
        : undefined;
    patient.documents.push({
      type: req.body.type || autoType || "other",
      label: req.body.label || file.originalname,
      url: url as string,
      uploadedAt: new Date(),
    });
  }
  await patient.save();

  req.rData = { patient };
  req.msg = "document_added";
  return next();
};

const normPhone = (p?: string) => String(p || "").replace(/\D/g, "").slice(-10);

/**
 * GET /admin/patients/duplicates — likely-duplicate patient records, so
 * front-desk isn't left with two records for the same real person and no
 * way to reconcile them. Two detection tiers:
 *   1. Exact phone match (10-digit, normalised) — the strongest signal,
 *      same as the phone-based identity linking used everywhere else in
 *      this app (patient app, ambulance field registration, etc).
 *   2. Exact name + date-of-birth match — catches walk-ins registered
 *      twice under two different phone numbers.
 * Never merges automatically — this only surfaces candidates for a human
 * to review and confirm via mergePatients.
 */
export const findDuplicates = async (req: Request, _res: Response, next: NextFunction) => {
  const patients = await HospitalPatient.find({ isDeleted: false })
    .select("patientId fullName phone gender dateOfBirth createdAt")
    .lean();

  const byPhone = new Map<string, any[]>();
  const byNameDob = new Map<string, any[]>();
  for (const p of patients) {
    const phoneKey = normPhone((p as any).phone);
    if (phoneKey.length === 10) {
      if (!byPhone.has(phoneKey)) byPhone.set(phoneKey, []);
      byPhone.get(phoneKey)!.push(p);
    }
    if ((p as any).dateOfBirth) {
      const nameKey = `${String((p as any).fullName || "").trim().toLowerCase()}|${new Date((p as any).dateOfBirth).toISOString().slice(0, 10)}`;
      if (!byNameDob.has(nameKey)) byNameDob.set(nameKey, []);
      byNameDob.get(nameKey)!.push(p);
    }
  }

  const groups: { reason: "phone" | "name_dob"; patients: any[] }[] = [];
  const seenViaPhone = new Set<string>();
  for (const group of byPhone.values()) {
    if (group.length < 2) continue;
    groups.push({ reason: "phone", patients: group });
    group.forEach((p: any) => seenViaPhone.add(String(p._id)));
  }
  for (const group of byNameDob.values()) {
    if (group.length < 2) continue;
    if (group.every((p: any) => seenViaPhone.has(String(p._id)))) continue; // already reported via phone
    groups.push({ reason: "name_dob", patients: group });
  }

  // Record counts so an admin can judge which side of a merge has the
  // richer history (keep the one with more real activity as the target).
  const allIds = groups.flatMap((g) => g.patients.map((p: any) => p._id));
  const [admCounts, apptCounts, invCounts] = allIds.length
    ? await Promise.all([
        Admission.aggregate([{ $match: { patientId: { $in: allIds } } }, { $group: { _id: "$patientId", n: { $sum: 1 } } }]),
        Appointment.aggregate([{ $match: { patientId: { $in: allIds } } }, { $group: { _id: "$patientId", n: { $sum: 1 } } }]),
        HospitalInvoice.aggregate([{ $match: { patientId: { $in: allIds } } }, { $group: { _id: "$patientId", n: { $sum: 1 } } }]),
      ])
    : [[], [], []];
  const toMap = (rows: any[]) => new Map(rows.map((r: any) => [String(r._id), r.n]));
  const admMap = toMap(admCounts);
  const apptMap = toMap(apptCounts);
  const invMap = toMap(invCounts);

  req.rData = {
    groups: groups.map((g) => ({
      reason: g.reason,
      patients: g.patients.map((p: any) => ({
        ...p,
        recordCounts: {
          admissions: admMap.get(String(p._id)) || 0,
          appointments: apptMap.get(String(p._id)) || 0,
          invoices: invMap.get(String(p._id)) || 0,
        },
      })),
    })),
  };
  req.msg = "success";
  return next();
};

/**
 * POST /admin/patients/merge — folds `sourceId` into `targetId`: re-points
 * every real reference across the app (admissions, appointments, EMR,
 * invoices, diagnostics, insurance policies/claims, ambulance stock/dispatch
 * history, billing audit, surgeries) from source to target, backfills any
 * target field left empty from source (never overwrites what target already
 * has), unions documents/emergency contacts so nothing is silently lost,
 * then soft-deletes source with a `mergedIntoPatientId` trail — never a hard
 * delete, so anything that still shows the old id can be traced forward.
 * Wrapped in a transaction: this touches a dozen collections, and a partial
 * failure here would be a real, hard-to-detect data-corruption risk.
 */
export const mergePatients = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const sourceId = String(b.sourceId || "");
  const targetId = String(b.targetId || "");
  if (!sourceId || !targetId || sourceId === targetId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "sourceId and targetId (two different patient ids) are required" };
    return next();
  }

  const [source, target] = await Promise.all([
    HospitalPatient.findOne({ _id: sourceId, isDeleted: false }),
    HospitalPatient.findOne({ _id: targetId, isDeleted: false }),
  ]);
  if (!source || !target) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = { hint: "sourceId/targetId must both be real, non-deleted patients" };
    return next();
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const patientIdModels = [
        Admission,
        Appointment,
        EmrEncounter,
        HospitalInvoice,
        DiagnosticOrder,
        PatientPolicy,
        InsuranceClaim,
        AmbulanceStockTransaction,
        BillingAudit,
        Surgery,
      ];
      for (const Model of patientIdModels) {
        await (Model as any).updateMany(
          { patientId: source._id },
          { $set: { patientId: target._id } },
          { session },
        );
      }
      for (const Model of [AmbulanceRequest, EmergencyDispatch]) {
        await (Model as any).updateMany(
          { hospitalPatientId: source._id },
          { $set: { hospitalPatientId: target._id } },
          { session },
        );
      }
      // Free-form string ref (pharmacy/ward stock issued directly to a
      // patient) — not a real ObjectId ref, so it needs its own pass.
      await StockTransaction.updateMany(
        { issuedToType: "patient", issuedToRef: String(source._id) },
        { $set: { issuedToRef: String(target._id) } },
        { session },
      );

      // Backfill target's empty fields from source — never overwrite what
      // target already has (the admin picked target deliberately). bloodGroup
      // defaults to "unknown" rather than being unset, so that counts as empty too.
      const isEmpty = (f: string, v: any) => !v || (f === "bloodGroup" && v === "unknown");
      const scalarFields = ["email", "dateOfBirth", "age", "bloodGroup", "photo", "appUserId"] as const;
      for (const f of scalarFields) {
        if (isEmpty(f, (target as any)[f]) && !isEmpty(f, (source as any)[f])) (target as any)[f] = (source as any)[f];
      }
      if (!target.address?.line1 && source.address?.line1) target.address = source.address;
      const historyFields = ["pastMedical", "surgical", "medications", "allergies", "familyHistory"] as const;
      for (const f of historyFields) {
        if (!target.healthHistory?.[f] && source.healthHistory?.[f]) {
          target.healthHistory = { ...target.healthHistory, [f]: source.healthHistory[f] };
        }
      }
      // Union arrays — real documents/contacts shouldn't be silently dropped.
      target.documents = [...(target.documents || []), ...(source.documents || [])];
      target.emergencyContacts = [...(target.emergencyContacts || []), ...(source.emergencyContacts || [])];
      await target.save({ session });

      source.isDeleted = true;
      source.isActive = false;
      source.mergedIntoPatientId = target._id;
      source.mergedAt = new Date();
      await source.save({ session });
    });
  } finally {
    await session.endSession();
  }

  req.rData = { patient: target };
  req.msg = "success";
  return next();
};
