import { Request, Response, NextFunction } from "express";
import {
  StaffCaseNote,
  StaffStockRequest,
} from "../models/ambulance-staff-extras.model";
import LeaveRequest from "../models/leave-request.model";
import HospitalPatient from "../models/hospital-patient.model";
import { nextSequence } from "../models/counter.model";
import { uploadFileToAws } from "../utils/s3";
import { emitToAdmin } from "../utils/socket.util";
import AmbulanceStaff from "../models/ambulance-staff.model";
import { SOSAlert } from "../models/sos.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import User from "../models/Users";

/** Leave / Patient / Case-notes / Stock / SOS for the ambulance-staff app. */

const sid = (req: Request) => (req as any).staffId;

/** Resolve the staff member's display name for admin-facing realtime alerts. */
const staffName = async (staffId: any): Promise<string> => {
  const s = await AmbulanceStaff.findById(staffId).select("fullName").lean();
  return (s as any)?.fullName || "A staff member";
};

// ----- SOS (crew raises their own emergency) -----
/**
 * POST /ambulance-staff/sos — the crew presses the SOS button (e.g. accident,
 * threat, vehicle breakdown). Raises a live SOS alert on the control-centre
 * dashboard with the crew's name + location so the call centre responds.
 */
export const raiseSos = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const staff: any = await AmbulanceStaff.findById(sid(req))
    .select("fullName mobileNumber countryCode")
    .lean();
  const name = staff?.fullName || "A crew member";
  const phone = staff?.mobileNumber
    ? `${staff.countryCode || ""}${staff.mobileNumber}`
    : "";
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
  const alert = await SOSAlert.create({
    triggeredBy: "DRIVER",
    source: "crew",
    crewStaffId: sid(req),
    crewName: name,
    crewPhone: phone,
    // coordinates are required on the model — default to [0,0] when GPS is off.
    location: { type: "Point", coordinates: hasGps ? [lng, lat] : [0, 0] },
    address: b.address || `Crew SOS — ${name}`,
    status: "ACTIVE",
  });
  // Ring the control-centre dashboards (SOS-Alerts live feed).
  emitToAdmin("sos-alert:new", {
    alertId: String(alert._id),
    source: "crew",
    staffId: String(sid(req)),
    crewName: name,
    crewPhone: phone,
    lat: hasGps ? lat : undefined,
    lng: hasGps ? lng : undefined,
  });
  req.rData = { alertId: String(alert._id) };
  req.msg = "sos_raised";
  return next();
};

// ----- Leave (central LeaveRequest store; shape kept stable for the app) -----
const dayCount = (from: Date, to: Date, half: boolean) => {
  const ms = dayStartUTC(to).getTime() - dayStartUTC(from).getTime();
  const whole = Math.max(0, Math.round(ms / 86400000)) + 1;
  return half ? 0.5 : whole;
};
const dayStartUTC = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
// Present central leave rows in the legacy shape the staff app already renders.
const toAppLeave = (lr: any) => ({
  _id: lr._id,
  type: lr.leaveTypeName || "Leave",
  fromDate: lr.fromDate,
  toDate: lr.toDate,
  day: lr.halfDay ? "Half Day" : "Full Day",
  reason: lr.reason,
  attachmentUrl: lr.attachmentUrl,
  status: lr.status === "approved" ? "Approved" : lr.status === "rejected" ? "Rejected" : "Pending",
});

export const listLeaves = async (req: Request, _res: Response, next: NextFunction) => {
  const rows = await LeaveRequest.find({ ambulanceStaffId: sid(req) }).sort({ createdAt: -1 }).lean();
  req.rData = { items: rows.map(toAppLeave) };
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
  const fromDate = new Date(b.from);
  const toDate = new Date(b.to);
  const halfDay = b.day === "Half Day";
  const lr = await LeaveRequest.create({
    subjectType: "ambulance_staff",
    ambulanceStaffId: sid(req),
    leaveTypeName: b.type,
    fromDate,
    toDate,
    days: dayCount(fromDate, toDate, halfDay),
    halfDay,
    reason: b.reason,
    attachmentUrl,
    status: "pending",
  });

  // Real-time alert to the admin dashboard so a new leave request is seen
  // without refreshing the HR Leave page.
  emitToAdmin("leave:new", {
    leaveId: String(lr._id),
    staffName: await staffName(sid(req)),
    type: lr.leaveTypeName,
    from: lr.fromDate,
    to: lr.toDate,
    day: lr.halfDay ? "Half Day" : "Full Day",
  });

  req.rData = { item: toAppLeave(lr) };
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
  // Bind this hospital record to the patient-app User that owns this phone
  // number, if one exists. Patient `mobileNumber` is stored as the bare
  // 10-digit number (see auth.controller), matching what staff type here.
  // The link lets the patient see this field-registered record + vitals in
  // their own app, and lets us trace which app user a patient belongs to.
  const phone = String(b.mobile).trim();
  const linkedUser = await User.findOne({ mobileNumber: phone, isDeleted: false })
    .select("_id")
    .lean();
  const item = await HospitalPatient.create({
    patientId: await mintPatientId(),
    fullName: b.name,
    phone,
    gender: gender as "male" | "female" | "other",
    dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : undefined,
    address: b.pincode ? { pincode: b.pincode } : undefined,
    appUserId: (linkedUser as any)?._id ?? undefined,
    source: "ambulance_staff",
    registeredByStaffId: sid(req),
  });

  // If the crew registered this patient DURING an active dispatch (the app
  // passes its dispatchId), link the record to that SOS journey so the dispatch
  // — and the admin — show who was actually treated. Only link a dispatch this
  // crew is assigned to.
  let linkedToDispatch = false;
  if (b.dispatchId) {
    const upd = await EmergencyDispatch.updateOne(
      {
        _id: b.dispatchId,
        $or: [{ driverStaffId: sid(req) }, { attendantStaffId: sid(req) }],
      },
      { $set: { hospitalPatientId: item._id } },
    );
    linkedToDispatch = upd.modifiedCount > 0;
  }

  // `linkedToApp` lets the staff app confirm the patient was matched to an
  // existing app account (vs a brand-new walk-in with no app).
  req.rData = { item, linkedToApp: Boolean(linkedUser), linkedToDispatch };
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
