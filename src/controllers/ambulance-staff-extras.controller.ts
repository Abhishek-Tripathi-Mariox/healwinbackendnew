import { Request, Response, NextFunction } from "express";
import {
  StaffLeave,
  StaffCaseNote,
  StaffStockRequest,
} from "../models/ambulance-staff-extras.model";
import HospitalPatient from "../models/hospital-patient.model";
import { nextSequence } from "../models/counter.model";
import { uploadFileToAws } from "../utils/s3";
import { emitToAdmin } from "../utils/socket.util";
import AmbulanceStaff from "../models/ambulance-staff.model";

/** Leave / Patient / Case-notes / Stock for the ambulance-staff app. */

const sid = (req: Request) => (req as any).staffId;

/** Resolve the staff member's display name for admin-facing realtime alerts. */
const staffName = async (staffId: any): Promise<string> => {
  const s = await AmbulanceStaff.findById(staffId).select("fullName").lean();
  return (s as any)?.fullName || "A staff member";
};

// ----- Leave -----
export const listLeaves = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await StaffLeave.find({ staffId: sid(req) }).sort({ createdAt: -1 }).lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const applyLeave = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.type || !b.from || !b.to) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "type, from and to are required" };
    return next();
  }
  // Optional supporting document (e.g. medical certificate) sent as multipart.
  let attachmentUrl: string | undefined;
  const files = req.files as Express.Multer.File[] | undefined;
  if (Array.isArray(files) && files.length > 0) {
    const { images } = await uploadFileToAws(files);
    attachmentUrl = images;
  }
  const item = await StaffLeave.create({
    staffId: sid(req),
    type: b.type,
    fromDate: new Date(b.from),
    toDate: new Date(b.to),
    day: b.day || "Full Day",
    reason: b.reason,
    attachmentUrl,
  });

  // Real-time alert to the admin dashboard so a new leave request is seen
  // without refreshing the HR Leave page.
  emitToAdmin("leave:new", {
    leaveId: String(item._id),
    staffName: await staffName(sid(req)),
    type: item.type,
    from: item.fromDate,
    to: item.toDate,
    day: item.day,
  });

  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Patients -----
// Patients added by an ambulance attendant in the field are real HOSPITAL
// patients: they register straight into the HMS `HospitalPatient` registry
// (so they show up on the admin Patients page) tagged with the attendant who
// registered them (`registeredByStaffId`, `source: "ambulance_staff"`).

const VALID_GENDERS = new Set(["male", "female", "other"]);

/** Mints the next human-readable patient id, e.g. HWP-000123 (same as admin). */
const mintPatientId = async (): Promise<string> => {
  const seq = await nextSequence("hospital_patient");
  return `HWP-${String(seq).padStart(6, "0")}`;
};

export const listPatients = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await HospitalPatient.find({
    registeredByStaffId: sid(req),
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const addPatient = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  // A hospital record needs a name, a contact phone and gender.
  if (!b.name || !b.mobile || !b.gender) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name, mobile and gender are required" };
    return next();
  }
  const gender = String(b.gender).toLowerCase();
  if (!VALID_GENDERS.has(gender)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "gender must be Male | Female | Other" };
    return next();
  }
  const dob = b.dob ? new Date(b.dob) : undefined;
  const item = await HospitalPatient.create({
    patientId: await mintPatientId(),
    fullName: b.name,
    phone: b.mobile,
    gender: gender as "male" | "female" | "other",
    dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : undefined,
    address: b.pincode ? { pincode: b.pincode } : undefined,
    source: "ambulance_staff",
    registeredByStaffId: sid(req),
  });
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Case notes -----
export const saveCaseNote = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await StaffCaseNote.create({
    staffId: sid(req),
    dispatchId: b.dispatchId,
    patientId: b.patientId,
    vitals: b.vitals,
    notes: b.notes,
  });
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Stock requests -----
export const createStockRequest = async (req: Request, _res: Response, next: NextFunction) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "items array is required" };
    return next();
  }
  const item = await StaffStockRequest.create({ staffId: sid(req), items });

  emitToAdmin("stock:new", {
    stockRequestId: String(item._id),
    staffName: await staffName(sid(req)),
    items: item.items,
  });

  req.rData = { item };
  req.msg = "success";
  return next();
};
