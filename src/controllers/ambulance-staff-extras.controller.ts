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
import Ambulance from "../models/ambulance.model";
import InventoryItem from "../models/inventory-item.model";
import { AmbulanceStock } from "../models/ambulance-stock.model";
import {
  consumeFromAmbulance,
  resolveCrewAmbulanceId,
} from "../services/ambulance-stock.service";
import AmbulanceRequest from "../models/ambulance-request.model";
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
  // passes its dispatchId), link the record to that journey so the dispatch
  // — and the admin — show who was actually treated. Only link a dispatch this
  // crew is assigned to. The active job can be either an SOS EmergencyDispatch
  // or a booked "Book Ambulance" AmbulanceRequest — the app just passes
  // whichever one is currently active without saying which kind it is, so try
  // both rather than silently no-op'ing when it's the latter (this used to
  // only try EmergencyDispatch, so field patients on booked rides never linked).
  let linkedToDispatch = false;
  if (b.dispatchId) {
    const assignedToThisCrew = {
      _id: b.dispatchId,
      $or: [{ driverStaffId: sid(req) }, { attendantStaffId: sid(req) }],
    };
    const updDispatch = await EmergencyDispatch.updateOne(assignedToThisCrew, {
      $set: { hospitalPatientId: item._id },
    });
    linkedToDispatch = updDispatch.modifiedCount > 0;
    if (!linkedToDispatch) {
      const updRequest = await AmbulanceRequest.updateOne(assignedToThisCrew, {
        $set: { hospitalPatientId: item._id },
      });
      linkedToDispatch = updRequest.modifiedCount > 0;
    }
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

/**
 * The ambulance this crew member is on. Staff are assigned FROM the ambulance
 * side, but those fields only cache the ACTIVE shift — so this also falls back
 * to the crew's shift. (Shared with the admin fulfil flow.)
 */
const crewAmbulanceId = (staffId: any) => resolveCrewAmbulanceId(staffId);

// ----- Stock requests -----
// Items now carry a real `itemId` (from the HMS inventory catalog) so fulfilling
// a request can move stock central → this crew's ambulance accurately.
export const createStockRequest = async (req: Request, _res: Response, next: NextFunction) => {
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];
  const items = raw
    .map((i: any) => ({
      itemId: i.itemId || undefined,
      name: String(i.name || "").trim(),
      qty: Math.max(0, Number(i.qty) || 0),
    }))
    .filter((i: any) => (i.itemId || i.name) && i.qty > 0);
  if (items.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "items array is required" };
    return next();
  }
  const item = await StaffStockRequest.create({
    staffId: sid(req),
    ambulanceId: await crewAmbulanceId(sid(req)),
    items,
  });

  emitToAdmin("stock:new", {
    stockRequestId: String(item._id),
    staffName: await staffName(sid(req)),
    items: item.items,
  });

  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Ambulance inventory (crew) -----

/** GET /ambulance-staff/inventory-items — the catalog to pick stock from. */
export const inventoryCatalog = async (req: Request, _res: Response, next: NextFunction) => {
  const q = String((req.query.q as string) || "").trim();
  const filter: any = { isDeleted: { $ne: true }, isActive: { $ne: false } };
  if (q) filter.name = new RegExp(q, "i");
  const items = await InventoryItem.find(filter)
    .select("name unit category sellingPrice unitCost currentStock")
    .sort({ name: 1 })
    .limit(200)
    .lean();
  req.rData = {
    items: items.map((i: any) => ({
      _id: String(i._id),
      name: i.name,
      unit: i.unit,
      category: i.category,
      sellingPrice: i.sellingPrice ?? 0,
      centralStock: i.currentStock ?? 0,
    })),
  };
  req.msg = "success";
  return next();
};

/** GET /ambulance-staff/stock — the crew's ambulance current on-hand stock. */
export const listMyStock = async (req: Request, _res: Response, next: NextFunction) => {
  const ambulanceId = await crewAmbulanceId(sid(req));
  if (!ambulanceId) {
    req.rData = { ambulanceId: null, items: [] };
    req.msg = "success";
    return next();
  }
  const rows = await AmbulanceStock.find({ ambulanceId, quantity: { $gt: 0 } })
    .populate("itemId", "name unit category sellingPrice")
    .sort({ updatedAt: -1 })
    .lean();
  req.rData = {
    ambulanceId: String(ambulanceId),
    items: rows.map((r: any) => ({
      itemId: String(r.itemId?._id || r.itemId),
      name: r.itemId?.name || "Item",
      unit: r.itemId?.unit || "",
      sellingPrice: r.itemId?.sellingPrice ?? 0,
      quantity: r.quantity,
    })),
  };
  req.msg = "success";
  return next();
};

/**
 * POST /ambulance-staff/stock/consume — log items used on a patient during a
 * dispatch. Decrements the ambulance's on-hand + bills the patient (in-transit).
 * body: { requestId?, dispatchId?, patientId?, items:[{itemId, qty}] }
 */
export const consumeStock = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i: any) => ({ itemId: i.itemId, qty: Math.max(0, Number(i.qty) || 0) }))
    .filter((i: any) => i.itemId && i.qty > 0);
  if (items.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "items array is required" };
    return next();
  }

  // Resolve the ambulance + patient context from the dispatch/request if given.
  let ambulanceId: any;
  let patientId: any = b.patientId || undefined;
  let patientName: string | undefined;
  const requestId: any = b.requestId || undefined;
  const dispatchId: any = b.dispatchId || undefined;

  if (dispatchId) {
    const d: any = await EmergencyDispatch.findById(dispatchId)
      .populate("hospitalPatientId", "fullName")
      .lean();
    if (d) {
      ambulanceId = d.ambulanceId;
      if (!patientId && d.hospitalPatientId) {
        patientId = (d.hospitalPatientId as any)._id;
        patientName = (d.hospitalPatientId as any).fullName;
      }
    }
  }
  if (requestId) {
    const r: any = await AmbulanceRequest.findById(requestId).lean();
    if (r) {
      ambulanceId = ambulanceId || r.ambulanceId;
      if (!patientName) patientName = r.patientName;
    }
  }
  if (!ambulanceId) ambulanceId = await crewAmbulanceId(sid(req));
  if (!ambulanceId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "No ambulance assigned to this crew" };
    return next();
  }

  const { lines, total, shortages } = await consumeFromAmbulance({
    ambulanceId,
    staffId: sid(req),
    requestId,
    dispatchId,
    patientId,
    patientName,
    items,
  });

  // Bill the patient: append to the AmbulanceRequest's in-transit expenses so
  // the fare breakup + grand total reflect the supplies used.
  if (requestId && lines.length > 0) {
    const reqDoc: any = await AmbulanceRequest.findById(requestId);
    if (reqDoc) {
      reqDoc.inTransitExpenses = [
        ...((reqDoc.inTransitExpenses as any[]) || []),
        ...lines.map((l) => ({
          inventoryItemId: l.itemId,
          item: l.itemName,
          qty: l.qty,
          rate: l.rate,
          amount: l.amount,
        })),
      ];
      reqDoc.inTransitTotal = (reqDoc.inTransitExpenses as any[]).reduce(
        (s: number, e: any) => s + (e.amount || 0),
        0,
      );
      reqDoc.grandTotal = (reqDoc.amount || 0) + reqDoc.inTransitTotal;
      await reqDoc.save();
    }
  }

  req.rData = { lines, total, shortages };
  req.msg = shortages.length ? "consumed_with_shortage" : "success";
  return next();
};
