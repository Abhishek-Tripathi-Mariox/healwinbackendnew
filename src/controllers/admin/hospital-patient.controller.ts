import { Request, Response, NextFunction } from "express";
import HospitalPatient from "../../models/hospital-patient.model";
import { nextSequence } from "../../models/counter.model";
import { uploadFileToAws } from "../../utils/s3";

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
    _id: req.params.id,
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
    _id: req.params.id,
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
    _id: req.params.id,
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
    _id: req.params.id,
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
    patient.documents.push({
      type: req.body.type || "other",
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
