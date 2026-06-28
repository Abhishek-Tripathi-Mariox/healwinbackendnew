import { Request, Response, NextFunction } from "express";
import Admission from "../../models/admission.model";
import Bed from "../../models/bed.model";
import Ward from "../../models/ward.model";
import HospitalPatient from "../../models/hospital-patient.model";
import { nextSequence } from "../../models/counter.model";
import { notifyHospitalPatient } from "../../services/hms-notify.service";

/**
 * Doctor Panel / HMS — IPD: bed master + admissions (admit, transfer,
 * discharge) and per-stay clinical logs (vitals, medication, progress notes).
 */

const mintAdmissionNo = async (): Promise<string> => {
  const seq = await nextSequence("admission");
  return `IPD-${String(seq).padStart(6, "0")}`;
};

// ============================ WARDS ===========================
// Managed picklist for the bed form. Beds store the ward NAME (Bed.ward), so
// these are the named wards an admin can create beds under.

export const listWards = async (req: Request, _res: Response, next: NextFunction) => {
  // Default to active wards; ?all=true returns soft-deleted ones too.
  const query: any = req.query.all === "true" ? {} : { isActive: true };
  const wards = await Ward.find(query).sort({ name: 1 }).lean();
  // Live bed count per ward so the admin sees usage at a glance.
  const counts = await Bed.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$ward", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c: any) => [c._id, c.count]));
  req.rData = {
    wards: wards.map((w: any) => ({ ...w, bedCount: countMap.get(w.name) ?? 0 })),
  };
  req.msg = "ward_list";
  return next();
};

export const createWard = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "ward name is required" };
    return next();
  }
  const exists = await Ward.findOne({ name: new RegExp(`^${name}$`, "i") });
  if (exists) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "a ward with this name already exists" };
    return next();
  }
  const ward = await Ward.create({
    name,
    description: b.description ? String(b.description).trim() : undefined,
    createdByAdminId: adminId,
  });
  req.rData = { ward };
  req.msg = "ward_created";
  return next();
};

export const updateWard = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const ward = await Ward.findById(req.params.id as string);
  if (!ward) {
    req.rCode = 5;
    req.msg = "ward_not_found";
    req.rData = {};
    return next();
  }
  if (b.name !== undefined && String(b.name).trim()) ward.name = String(b.name).trim();
  if (b.description !== undefined) ward.description = String(b.description).trim() || undefined;
  if (b.isActive !== undefined) ward.isActive = !!b.isActive;
  await ward.save();
  req.rData = { ward };
  req.msg = "ward_updated";
  return next();
};

export const deleteWard = async (req: Request, _res: Response, next: NextFunction) => {
  const ward = await Ward.findById(req.params.id as string);
  if (!ward) {
    req.rCode = 5;
    req.msg = "ward_not_found";
    req.rData = {};
    return next();
  }
  // Block deletion while active beds still belong to this ward — they'd be
  // orphaned. The admin must move/remove those beds first.
  const bedsInWard = await Bed.countDocuments({ ward: ward.name, isActive: true });
  if (bedsInWard > 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `Can't delete — ${bedsInWard} active bed(s) still in this ward.` };
    return next();
  }
  // Soft delete so any historical (inactive) beds keep a valid label.
  ward.isActive = false;
  await ward.save();
  req.rData = {};
  req.msg = "ward_deleted";
  return next();
};

// ============================ BEDS ============================

export const listBeds = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const query: any = { isActive: true };
  if (req.query.ward) query.ward = req.query.ward;
  if (req.query.status) query.status = req.query.status;
  const beds = await Bed.find(query)
    .sort({ ward: 1, bedNumber: 1 })
    .populate({
      path: "currentAdmissionId",
      select: "admissionNo patientId",
      populate: { path: "patientId", select: "patientId fullName" },
    })
    .lean();
  req.rData = { beds };
  req.msg = "bed_list";
  return next();
};

export const createBed = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.ward || !b.bedNumber) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "ward and bedNumber are required" };
    return next();
  }
  const exists = await Bed.findOne({ ward: b.ward, bedNumber: b.bedNumber });
  if (exists) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "this ward already has a bed with that number" };
    return next();
  }
  const bed = await Bed.create({
    ward: b.ward,
    bedNumber: b.bedNumber,
    bedType: b.bedType || "general",
    dailyCharge: b.dailyCharge != null && b.dailyCharge !== "" ? Number(b.dailyCharge) : undefined,
    status: b.status === "maintenance" ? "maintenance" : "available",
    createdByAdminId: adminId,
  });
  req.rData = { bed };
  req.msg = "bed_created";
  return next();
};

export const updateBed = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const bed = await Bed.findById(req.params.id);
  if (!bed) {
    req.rCode = 5;
    req.msg = "bed_not_found";
    req.rData = {};
    return next();
  }
  // Don't allow flipping an occupied bed's status out from under an admission.
  if (b.status !== undefined && bed.status !== "occupied")
    bed.status = b.status;
  if (b.bedType !== undefined) bed.bedType = b.bedType;
  if (b.dailyCharge !== undefined)
    bed.dailyCharge = b.dailyCharge === "" ? undefined : Number(b.dailyCharge);
  if (b.isActive !== undefined && bed.status !== "occupied")
    bed.isActive = b.isActive;
  await bed.save();
  req.rData = { bed };
  req.msg = "bed_updated";
  return next();
};

// ========================= ADMISSIONS =========================

export const listAdmissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  const [items, total] = await Promise.all([
    Admission.find(query)
      .sort({ admittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patientId", "patientId fullName phone gender age")
      .populate("attendingDoctorId", "fullName")
      .lean(),
    Admission.countDocuments(query),
  ]);
  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "admission_list";
  return next();
};

export const detailAdmission = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const admission = await Admission.findById(req.params.id)
    .populate("patientId", "patientId fullName phone gender age bloodGroup")
    .populate("attendingDoctorId", "fullName")
    .lean();
  if (!admission) {
    req.rCode = 5;
    req.msg = "admission_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { admission };
  req.msg = "admission_detail";
  return next();
};

/** POST /admin/ipd/admissions — admit a patient and occupy a bed. */
export const admit = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.patientId || !b.attendingDoctorId || !b.bedId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "patientId, attendingDoctorId and bedId are required" };
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
  const bed = await Bed.findById(b.bedId);
  if (!bed || !bed.isActive) {
    req.rCode = 5;
    req.msg = "bed_not_found";
    req.rData = {};
    return next();
  }
  if (bed.status !== "available") {
    req.rCode = 0;
    req.msg = "not_available";
    req.rData = { hint: "selected bed is not available" };
    return next();
  }

  const admittedAt = b.admittedAt ? new Date(b.admittedAt) : new Date();
  const admission = await Admission.create({
    admissionNo: await mintAdmissionNo(),
    patientId: b.patientId,
    attendingDoctorId: b.attendingDoctorId,
    admittedAt,
    reason: b.reason || undefined,
    carePlan: b.carePlan || undefined,
    currentBedId: bed._id,
    currentWard: bed.ward,
    currentBedNumber: bed.bedNumber,
    bedHistory: [
      { ward: bed.ward, bedNumber: bed.bedNumber, bedId: bed._id, fromAt: admittedAt },
    ],
    createdByAdminId: adminId,
  });

  bed.status = "occupied";
  bed.currentAdmissionId = admission._id;
  await bed.save();

  req.rData = { admission };
  req.msg = "admission_created";
  return next();
};

/** POST /admin/ipd/admissions/:id/transfer — move to another bed. */
export const transfer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const admission = await Admission.findById(req.params.id);
  if (!admission || admission.status !== "admitted") {
    req.rCode = 5;
    req.msg = "admission_not_found";
    req.rData = {};
    return next();
  }
  const newBed = await Bed.findById(b.bedId);
  if (!newBed || !newBed.isActive) {
    req.rCode = 5;
    req.msg = "bed_not_found";
    req.rData = {};
    return next();
  }
  if (newBed.status !== "available") {
    req.rCode = 0;
    req.msg = "not_available";
    req.rData = { hint: "target bed is not available" };
    return next();
  }

  const now = new Date();
  // Release the current bed.
  if (admission.currentBedId) {
    const oldBed = await Bed.findById(admission.currentBedId);
    if (oldBed) {
      oldBed.status = "available";
      oldBed.currentAdmissionId = null;
      await oldBed.save();
    }
    const open = admission.bedHistory.find((h) => !h.toAt);
    if (open) open.toAt = now;
  }

  // Occupy the new bed.
  newBed.status = "occupied";
  newBed.currentAdmissionId = admission._id;
  await newBed.save();

  admission.currentBedId = newBed._id;
  admission.currentWard = newBed.ward;
  admission.currentBedNumber = newBed.bedNumber;
  admission.bedHistory.push({
    ward: newBed.ward,
    bedNumber: newBed.bedNumber,
    bedId: newBed._id,
    fromAt: now,
  });
  await admission.save();

  req.rData = { admission };
  req.msg = "admission_updated";
  return next();
};

/** POST /admin/ipd/admissions/:id/discharge — discharge and free the bed. */
export const discharge = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const admission = await Admission.findById(req.params.id);
  if (!admission || admission.status !== "admitted") {
    req.rCode = 5;
    req.msg = "admission_not_found";
    req.rData = {};
    return next();
  }
  const now = b.dischargedAt ? new Date(b.dischargedAt) : new Date();
  if (admission.currentBedId) {
    const bed = await Bed.findById(admission.currentBedId);
    if (bed) {
      bed.status = "available";
      bed.currentAdmissionId = null;
      await bed.save();
    }
    const open = admission.bedHistory.find((h) => !h.toAt);
    if (open) open.toAt = now;
  }
  admission.status = "discharged";
  admission.dischargedAt = now;
  admission.dischargeSummary = b.dischargeSummary || admission.dischargeSummary;
  admission.currentBedId = null;
  await admission.save();

  // Notify the patient their discharge summary is available in the app.
  void notifyHospitalPatient(
    admission.patientId,
    "Discharged",
    "You have been discharged. Your discharge summary is available in Hospital Records.",
    { tab: "admissions" },
  );

  req.rData = { admission };
  req.msg = "admission_updated";
  return next();
};

/**
 * POST /admin/ipd/admissions/:id/log — append a clinical log entry.
 * body.kind = "vital" | "medication" | "progress" | "careplan"
 */
export const addLog = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const admission = await Admission.findById(req.params.id);
  if (!admission) {
    req.rCode = 5;
    req.msg = "admission_not_found";
    req.rData = {};
    return next();
  }

  switch (b.kind) {
    case "vital":
      admission.vitalsLog.push({
        at: new Date(),
        bloodPressure: b.bloodPressure,
        pulse: b.pulse != null ? Number(b.pulse) : undefined,
        temperature: b.temperature != null ? Number(b.temperature) : undefined,
        spo2: b.spo2 != null ? Number(b.spo2) : undefined,
        respiratoryRate:
          b.respiratoryRate != null ? Number(b.respiratoryRate) : undefined,
        recordedByAdminId: adminId,
      });
      break;
    case "medication":
      if (!b.drug) {
        req.rCode = 0;
        req.msg = "validation_failed";
        req.rData = { hint: "drug is required for a medication log" };
        return next();
      }
      admission.medicationLog.push({
        at: new Date(),
        drug: b.drug,
        dose: b.dose,
        route: b.route,
        administeredByAdminId: adminId,
        notes: b.notes,
      });
      break;
    case "progress":
      if (!b.note) {
        req.rCode = 0;
        req.msg = "validation_failed";
        req.rData = { hint: "note is required for a progress note" };
        return next();
      }
      admission.progressNotes.push({
        at: new Date(),
        note: b.note,
        authorAdminId: adminId,
      });
      break;
    case "careplan":
      admission.carePlan = b.carePlan || "";
      break;
    default:
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = { hint: "kind must be vital | medication | progress | careplan" };
      return next();
  }

  await admission.save();
  req.rData = { admission };
  req.msg = "admission_updated";
  return next();
};
