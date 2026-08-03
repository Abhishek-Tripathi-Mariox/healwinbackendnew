import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import AuthMiddleware from "../middlewares/auth.middleware";
import Pharmacy from "../models/pharmacy.model";
import PatientFamilyMember from "../models/patient-family-member.model";
import User from "../models/Users";
import SavedContact from "../models/saved-contact.model";
import PatientMedicalRecord from "../models/patient-medical-record.model";
import HospitalPatient from "../models/hospital-patient.model";
import { StaffCaseNote } from "../models/ambulance-staff-extras.model";
import { Admin } from "../models/admin.model";
import LabTest from "../models/lab-test.model";
import PharmacyProduct from "../models/pharmacy-product.model";
import InventoryItem from "../models/inventory-item.model";
import StockTransaction from "../models/stock-transaction.model";
import { issueFefo, returnFefo } from "../services/inventory-batch.service";
import AmbulanceRequest from "../models/ambulance-request.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import { SOSSubmission } from "../models/sos-submission.model";
import VehicleType from "../models/vehicle-type.model";
import { PharmacyOrder, LabBooking, Consultation } from "../models/patient-commerce.model";
import HomePromo from "../models/home-promo.model";
import FirstAidGuide from "../models/first-aid-guide.model";
import { MembershipPlan, UserMembership } from "../models/membership.model";
import { Appointment } from "../models/appointment.model";
import { getDoctorSlots, isSlotAvailable } from "../services/doctor-slots.service";
import DoctorSchedule from "../models/doctor-schedule.model";
import { HospitalInvoice } from "../models/hospital-invoice.model";
import { DiagnosticOrder } from "../models/diagnostic-order.model";
import { EmrEncounter } from "../models/emr-encounter.model";
import { nextSequence } from "../models/counter.model";
import { Admission } from "../models/admission.model";
import { calculateFare } from "../services/fare.service";
import * as PromoService from "../services/promo.service";
import { reverseGeocode, searchPlaces, resolvePlace } from "../services/geocode.service";
import { haversineKm, etaMinutesFromKm } from "../utils/geo.util";
import { generateSlots, slotToDate, slotLabelFor } from "../utils/slots.util";
import { emitToAdmin, emitToUser } from "../utils/socket.util";
import Ambulance from "../models/ambulance.model";
import config from "../config";
import { Types } from "mongoose";
import { uploadFileToAws } from "../utils/s3";
import { InsurancePayer, PatientPolicy, InsuranceClaim } from "../models/insurance.model";

const router = Router();
const { verifyUserToken } = AuthMiddleware();

// Uploaded to S3 (uploadFileToAws) rather than local disk — local disk was a
// stub that silently lost files on every redeploy/restart/scale-out (nothing
// persists it across instances), which is why "view record" would hang/fail
// to load. Memory storage here just buffers the file en route to S3.
const recordsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Family-member photo uploads (served from /uploads/family by the static handler).
const familyDir = path.join(process.cwd(), "uploads", "family");
try {
  fs.mkdirSync(familyDir, { recursive: true });
} catch {
  /* exists */
}
const familyUpload = multer({
  storage: multer.diskStorage({
    destination: familyDir,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const servedUrl = (req: Request, sub: string, file?: Express.Multer.File) =>
  file ? `${req.protocol}://${req.get("host")}/uploads/${sub}/${path.basename(file.path)}` : undefined;

/**
 * Stub implementations for patient-app domains that don't have real backend
 * controllers yet (doctors, pharmacy, lab, medical records, family members,
 * consultations, home feed). These return shape-correct empty/placeholder
 * responses so the Flutter patient app runs without 404s while the real
 * backend is being built.
 *
 * Where the patient app's UX expects round-trip persistence (family
 * members, medical records, ambulance bookings) these stubs keep an
 * in-memory store keyed by userId so additions survive a refresh within
 * the same backend process. Replaced by real Mongo models when the
 * corresponding domain ships.
 */

const ok = (res: Response, data: any = {}) =>
  res.json({ success: true, data, message: "ok" });

const emptyList = (res: Response) =>
  res.json({ success: true, data: [], message: "ok" });

const uid = (req: Request) => String((req as any).userId ?? "anon");

/**
 * Family-member records that represent THIS logged-in user under someone else's
 * account — matched by phone (the user's own mobileNumber vs the family-member
 * `phone`). Lets e.g. a father, added as a family member by his son and logging
 * in with his own number, see the bookings / records that were made FOR him.
 * Matched on the last 10 digits so +91 / spacing variations still line up.
 */
const familyMemberIdsFor = async (req: Request): Promise<Types.ObjectId[]> => {
  const me: any = await User.findById(uid(req)).select("mobileNumber").lean();
  const last10 = String(me?.mobileNumber || "").replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return [];
  const members = await PatientFamilyMember.find({
    phone: { $regex: `${last10}$` },
  })
    .select("_id")
    .lean();
  return members.map((m: any) => m._id);
};

/** Mongo filter for "mine OR made for me as a family member". */
const ownOrFamilyFilter = (req: Request, famIds: Types.ObjectId[]) =>
  famIds.length
    ? { $or: [{ userId: uid(req) }, { familyMemberId: { $in: famIds } }] }
    : { userId: uid(req) };

// ================== Family members (persisted) ==================
router.get("/family-members", verifyUserToken, async (req, res) => {
  const list = await PatientFamilyMember.find({ userId: uid(req) }).sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});

router.post("/family-members", verifyUserToken, familyUpload.single("photo"), async (req, res) => {
  const b = req.body ?? {};
  const photo = servedUrl(req, "family", req.file);
  const member = await PatientFamilyMember.create({
    userId: uid(req),
    name: b.name,
    relation: b.relation,
    phone: b.phone,
    age: b.age != null ? String(b.age) : undefined,
    gender: b.gender,
    photo,
    bloodGroup: b.bloodGroup,
    conditions: b.conditions,
  });
  ok(res, member);
});

router.put("/family-members/:id", verifyUserToken, familyUpload.single("photo"), async (req, res) => {
  const b = req.body ?? {};
  const photo = servedUrl(req, "family", req.file);
  const set: Record<string, any> = {
    name: b.name,
    relation: b.relation,
    phone: b.phone,
    age: b.age != null ? String(b.age) : undefined,
    gender: b.gender,
    bloodGroup: b.bloodGroup,
    conditions: b.conditions,
  };
  if (photo) set.photo = photo; // only overwrite when a new image was uploaded
  const updated = await PatientFamilyMember.findOneAndUpdate(
    { _id: (req.params.id as string), userId: uid(req) },
    { $set: set },
    { new: true },
  );
  if (!updated) return res.status(404).json({ success: false, message: "Member not found" });
  ok(res, updated);
});

router.delete("/family-members/:id", verifyUserToken, async (req, res) => {
  await PatientFamilyMember.deleteOne({ _id: (req.params.id as string), userId: uid(req) });
  ok(res);
});

// ================== Saved contacts — "book for someone else" (persisted) ==================
// A reusable recipient book (name + phone + optional address/location), parcel-app
// style: pick a saved contact when booking an ambulance for another person, and it's
// remembered for next time.
const contactFields = (b: any) => ({
  name: b.name,
  phone: b.phone,
  relation: b.relation || undefined,
  address: b.address || undefined,
  lat: b.lat != null ? Number(b.lat) : undefined,
  lng: b.lng != null ? Number(b.lng) : undefined,
  isDefault: b.isDefault === true || b.isDefault === "true",
});

router.get("/contacts", verifyUserToken, async (req, res) => {
  const list = await SavedContact.find({ userId: uid(req) }).sort({ isDefault: -1, createdAt: -1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});

router.post("/contacts", verifyUserToken, async (req, res) => {
  const f = contactFields(req.body ?? {});
  if (!f.name || !f.phone) {
    return res.status(400).json({ success: false, message: "name and phone are required" });
  }
  // Only one default per user.
  if (f.isDefault) await SavedContact.updateMany({ userId: uid(req) }, { $set: { isDefault: false } });
  const contact = await SavedContact.create({ userId: uid(req), ...f });
  ok(res, contact);
});

router.put("/contacts/:id", verifyUserToken, async (req, res) => {
  const f = contactFields(req.body ?? {});
  if (f.isDefault) await SavedContact.updateMany({ userId: uid(req) }, { $set: { isDefault: false } });
  const updated = await SavedContact.findOneAndUpdate(
    { _id: (req.params.id as string), userId: uid(req) },
    { $set: f },
    { new: true },
  );
  if (!updated) return res.status(404).json({ success: false, message: "Contact not found" });
  ok(res, updated);
});

router.delete("/contacts/:id", verifyUserToken, async (req, res) => {
  await SavedContact.deleteOne({ _id: (req.params.id as string), userId: uid(req) });
  ok(res);
});

// ================== Doctors (from Admin staff with the Doctor role) ==================
// Single source of truth: a doctor is an admin user (role "Doctor") with a
// doctorProfile. They log into the panel AND are listed here for the app.
const DOCTOR_QUERY = {
  roleName: "Doctor",
  isActive: true,
  isDeleted: false,
  "doctorProfile.listInApp": { $ne: false },
  // Only list doctors whose profile has actually been filled in (avoids blank
  // Doctor-role admin accounts polluting the app directory).
  "doctorProfile.speciality": { $nin: [null, ""] },
};

// Shape an Admin doc into the app's doctor model.
const toAppDoctor = (a: any) => ({
  _id: a._id,
  name: a.fullName,
  speciality: a.doctorProfile?.speciality || "",
  qualification: a.doctorProfile?.qualification || "",
  experienceYears: a.doctorProfile?.experienceYears ?? 0,
  rating: a.doctorProfile?.rating ?? 0,
  reviewCount: a.doctorProfile?.reviewCount ?? 0,
  consultationFee: a.doctorProfile?.consultationFee ?? 0,
  hospital: a.doctorProfile?.hospital || "",
  languages: a.doctorProfile?.languages || [],
  teleconsult: a.doctorProfile?.teleconsult ?? true,
  about: a.doctorProfile?.about || "",
  photo: a.profileImage || "",
});

router.get("/doctors/specialities", async (_req, res) => {
  const specs: string[] = await Admin.distinct("doctorProfile.speciality", DOCTOR_QUERY);
  res.json({ success: true, data: specs.filter(Boolean).map((name, i) => ({ _id: `s${i}`, name, icon: "" })) });
});
router.get("/doctors", async (req, res) => {
  const { q, speciality } = req.query as { q?: string; speciality?: string };
  const query: any = { ...DOCTOR_QUERY };
  if (speciality) query["doctorProfile.speciality"] = speciality;
  if (q) query.fullName = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const list = await Admin.find(query).sort({ fullName: 1 }).lean();
  res.json({ success: true, data: list.map(toAppDoctor), message: "ok" });
});
router.get("/doctors/:id", async (req, res) => {
  const a = await Admin.findOne({ _id: (req.params.id as string), roleName: "Doctor", isDeleted: false }).lean();
  if (!a) return res.status(404).json({ success: false, message: "Doctor not found" });
  ok(res, toAppDoctor(a));
});
// Short date label from a YYYY-MM-DD string (e.g. "18 Jun"), TZ-independent.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (dateStr: string): string => {
  const [, m, d] = dateStr.split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : dateStr;
};
const fullSlotLabel = (dateStr: string, time: string): string =>
  `${slotLabelFor(time)}, ${shortDate(dateStr)}`;

// Real appointment slots for a doctor on a given date. Past + already-booked
// times are returned as unavailable so the patient can only pick an open slot.
router.get("/doctors/:id/slots", verifyUserToken, async (req, res) => {
  const dateStr = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ success: false, message: "date (YYYY-MM-DD) is required" });
  }
  const slots = generateSlots(dateStr);
  const dayStart = new Date(`${dateStr}T00:00:00+05:30`);
  const dayEnd = new Date(`${dateStr}T23:59:59+05:30`);
  // Cross-check against real OPD appointments too — Consultation
  // (teleconsult) and Appointment (in-person OPD) are separate models keyed
  // off the same doctorId with no shared ledger; without this a doctor
  // could be double-booked across the two flows for the same time.
  const [booked, bookedOpd] = await Promise.all([
    Consultation.find({
      doctorId: req.params.id,
      status: { $ne: "CANCELLED" },
      scheduledAt: { $gte: dayStart, $lte: dayEnd },
    })
      .select("scheduledAt")
      .lean(),
    Appointment.find({
      doctorId: req.params.id,
      status: { $ne: "cancelled" },
      scheduledAt: { $gte: dayStart, $lte: dayEnd },
    })
      .select("scheduledAt")
      .lean(),
  ]);
  const bookedSet = new Set(
    [...booked, ...bookedOpd].map((c: any) => new Date(c.scheduledAt).getTime()),
  );
  const now = Date.now();
  const items = slots.map((s) => ({
    time: s.time,
    label: s.label,
    available: s.startsAt.getTime() > now && !bookedSet.has(s.startsAt.getTime()),
  }));
  res.json({ success: true, data: items, message: "ok" });
});

// Lab sample-collection slots for a date (generic; no per-resource limit yet).
router.get("/lab/slots", verifyUserToken, async (req, res) => {
  const dateStr = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ success: false, message: "date (YYYY-MM-DD) is required" });
  }
  const now = Date.now();
  const items = generateSlots(dateStr).map((s) => ({
    time: s.time,
    label: s.label,
    available: s.startsAt.getTime() > now,
  }));
  res.json({ success: true, data: items, message: "ok" });
});

// Real, persisted doctor consultations (booked from the app, fulfilled by the
// Doctor-role admin). Captures the doctor's fee + speciality at booking time.
router.post("/consultations", verifyUserToken, async (req, res) => {
  const b: any = req.body ?? {};
  if (!b.doctorId) {
    return res.status(400).json({ success: false, message: "doctorId is required" });
  }
  const doc = await Admin.findOne({ _id: b.doctorId, roleName: "Doctor", isDeleted: false }).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Doctor not found" });

  // Schedule the appointment when a date + slot are provided. Validate it's in
  // the future and not already taken (the slots endpoint hides taken times, but
  // re-check to avoid a race).
  let scheduledAt: Date | undefined;
  let slotTime: string | undefined;
  let slotLabel: string | undefined;
  if (b.date && b.slot) {
    const when = slotToDate(String(b.date), String(b.slot));
    if (!when || when.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: "Please pick a valid future slot" });
    }
    const [clash, clashOpd] = await Promise.all([
      Consultation.findOne({
        doctorId: doc._id,
        status: { $ne: "CANCELLED" },
        scheduledAt: when,
      }).lean(),
      Appointment.findOne({
        doctorId: doc._id,
        status: { $ne: "cancelled" },
        scheduledAt: when,
      }).lean(),
    ]);
    if (clash || clashOpd) {
      return res.status(409).json({ success: false, message: "That slot was just taken — pick another" });
    }
    scheduledAt = when;
    slotTime = String(b.slot);
    slotLabel = fullSlotLabel(String(b.date), String(b.slot));
  }

  const c = await Consultation.create({
    userId: uid(req),
    doctorId: doc._id,
    doctorName: doc.fullName,
    speciality: (doc as any).doctorProfile?.speciality,
    familyMemberId: b.familyMemberId || undefined,
    slotId: b.slotId || undefined,
    scheduledAt,
    slotTime,
    slotLabel,
    symptoms: b.symptoms || undefined,
    teleconsult: b.teleconsult !== false,
    fee: (doc as any).doctorProfile?.consultationFee ?? 0,
  });
  // Real-time: light up the admin Patient Orders inbox the instant it's placed.
  emitToAdmin("consultation:new", { id: String(c._id), doctorName: doc.fullName });
  ok(res, c);
});
router.get("/consultations", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const list = await Consultation.find(ownOrFamilyFilter(req, famIds)).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/consultations/:id", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const c = await Consultation.findOne({ _id: (req.params.id as string), ...ownOrFamilyFilter(req, famIds) }).lean();
  if (!c) return res.status(404).json({ success: false, message: "Consultation not found" });
  ok(res, c);
});
router.post("/consultations/:id/cancel", verifyUserToken, async (req, res) => {
  const c: any = await Consultation.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!c) return res.status(404).json({ success: false, message: "Consultation not found" });
  if (["COMPLETED", "CANCELLED"].includes(c.status)) return ok(res, c.toObject());
  c.status = "CANCELLED";
  await c.save();
  emitToAdmin("consultation:updated", { id: String(c._id), status: "CANCELLED" });
  ok(res, c.toObject());
});
// Patient reschedule — pick a new date + slot (re-checks the doctor isn't double-booked).
router.post("/consultations/:id/reschedule", verifyUserToken, async (req, res) => {
  const c: any = await Consultation.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!c) return res.status(404).json({ success: false, message: "Consultation not found" });
  if (["COMPLETED", "CANCELLED"].includes(c.status)) {
    return res.status(400).json({ success: false, message: "This consultation can't be rescheduled" });
  }
  const when = slotToDate(String(req.body?.date || ""), String(req.body?.slot || ""));
  if (!when || when.getTime() <= Date.now()) {
    return res.status(400).json({ success: false, message: "Please pick a valid future slot" });
  }
  const clash = await Consultation.findOne({
    doctorId: c.doctorId,
    status: { $ne: "CANCELLED" },
    scheduledAt: when,
    _id: { $ne: c._id },
  }).lean();
  if (clash) return res.status(409).json({ success: false, message: "That slot was just taken — pick another" });
  c.scheduledAt = when;
  c.slotTime = String(req.body.slot);
  c.slotLabel = fullSlotLabel(String(req.body.date), String(req.body.slot));
  await c.save();
  emitToAdmin("consultation:updated", { id: String(c._id), status: c.status });
  ok(res, c.toObject());
});

// ================== Pharmacy (from DB) ==================
router.get("/pharmacy/categories", async (_req, res) => {
  const cats: string[] = await PharmacyProduct.distinct("category", { isActive: true, isDeleted: false });
  res.json({ success: true, data: cats.filter(Boolean).map((name, i) => ({ _id: `c${i}`, name })) });
});
// Products linked to a real InventoryItem show its live currentStock rather
// than the (no-longer-written-to) static `stock` field, so "out of stock"
// here matches what the pharmacy/dispensing side actually has on the shelf.
const withRealStock = async (rows: any[]) => {
  const itemIds = rows.map((r) => r.itemId).filter(Boolean);
  if (!itemIds.length) return rows;
  const items = await InventoryItem.find({ _id: { $in: itemIds } }).select("currentStock").lean();
  const byId = new Map(items.map((it: any) => [String(it._id), it.currentStock]));
  return rows.map((r) => (r.itemId && byId.has(String(r.itemId)) ? { ...r, stock: byId.get(String(r.itemId)) } : r));
};
router.get("/pharmacy/products", async (req, res) => {
  const { q, category } = req.query as { q?: string; category?: string };
  const query: any = { isActive: true, isDeleted: false };
  if (category) query.category = category;
  if (q) query.name = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const list = await PharmacyProduct.find(query).sort({ name: 1 }).lean();
  res.json({ success: true, data: await withRealStock(list), message: "ok" });
});
router.get("/pharmacy/products/:id", async (req, res) => {
  const p = await PharmacyProduct.findOne({ _id: (req.params.id as string), isDeleted: false }).lean();
  if (!p) return res.status(404).json({ success: false, message: "Product not found" });
  const [withStock] = await withRealStock([p]);
  ok(res, withStock);
});
router.get("/pharmacy/cart", verifyUserToken, (_req, res) =>
  ok(res, { items: [], total: 0 })
);
router.post("/pharmacy/cart", verifyUserToken, (req, res) => ok(res, req.body));

// Real, persisted pharmacy orders. Prices are read from the catalog at order
// time so the stored total can't be tampered with from the client. Products
// linked to a real InventoryItem (see PharmacyProduct.itemId) draw from the
// SAME HMS stock ledger EMR/ward dispensing uses — via issueFefo, so this
// order is not a second, unreconciled stock universe. Unlinked (legacy)
// products still decrement their own PharmacyProduct.stock counter.
router.post("/pharmacy/orders", verifyUserToken, async (req, res) => {
  const b: any = req.body ?? {};
  const reqItems: { productId: string; qty: number }[] = Array.isArray(b.items) ? b.items : [];
  if (reqItems.length === 0) {
    return res.status(400).json({ success: false, message: "items are required" });
  }
  const ids = reqItems.map((i) => i.productId).filter(Boolean);
  const products = await PharmacyProduct.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).lean();
  const byId = new Map(products.map((p: any) => [String(p._id), p]));
  const lines = reqItems
    .map((i) => {
      const p: any = byId.get(String(i.productId));
      if (!p) return null;
      const qty = Math.max(1, Number(i.qty) || 1);
      return { productId: p._id, name: p.name, price: p.price ?? 0, qty, itemId: p.itemId };
    })
    .filter(Boolean) as { productId: any; name: string; price: number; qty: number; itemId?: any }[];
  if (lines.length === 0) {
    return res.status(400).json({ success: false, message: "No valid products in order" });
  }

  // Draw real stock for each line, tracking what was taken so a partial
  // failure partway through can be compensated (rolled back) rather than
  // leaving stock silently decremented with no order to show for it.
  const items: any[] = [];
  const rollback: (() => Promise<void>)[] = [];
  try {
    for (const line of lines) {
      if (line.itemId) {
        const result = await issueFefo({ itemId: line.itemId, quantity: line.qty });
        rollback.push(() =>
          returnFefo({ itemId: line.itemId, drawn: result.drawn, legacyDrawn: result.legacyDrawn }).then(() => undefined),
        );
        await StockTransaction.create({
          itemId: line.itemId,
          type: "out",
          quantity: line.qty,
          balanceAfter: result.currentStock,
          amount: result.costOfGoodsIssued,
          reason: "Pharmacy order",
          issuedToType: "patient",
          issuedToRef: String(uid(req)),
          performedByUserId: uid(req),
        });
        items.push({
          productId: line.productId,
          name: line.name,
          price: line.price,
          qty: line.qty,
          itemId: line.itemId,
          batchDraws: result.drawn.map((d) => ({ batchId: d.batchId, quantity: d.quantity })),
          legacyDrawnQty: result.legacyDrawn,
        });
      } else {
        const updated = await PharmacyProduct.findOneAndUpdate(
          { _id: line.productId, stock: { $gte: line.qty } },
          { $inc: { stock: -line.qty } },
        );
        if (!updated) throw new Error(`insufficient_stock:${line.name}`);
        rollback.push(() =>
          PharmacyProduct.updateOne({ _id: line.productId }, { $inc: { stock: line.qty } }).then(() => undefined),
        );
        items.push({ productId: line.productId, name: line.name, price: line.price, qty: line.qty });
      }
    }
  } catch (e: any) {
    for (const undo of rollback.reverse()) {
      await undo().catch(() => undefined);
    }
    const msg = String(e?.message || "");
    if (msg.startsWith("insufficient_stock")) {
      return res.status(400).json({ success: false, message: `Out of stock: ${msg.split(":")[1] || "one or more items"}` });
    }
    return res.status(400).json({ success: false, message: "Could not reserve stock for this order" });
  }

  const totalAmount = items.reduce((s, it) => s + it.price * it.qty, 0);
  let order: any;
  try {
    order = await PharmacyOrder.create({
      userId: uid(req),
      items,
      addressId: b.addressId || undefined,
      prescriptionUrl: b.prescriptionUrl || undefined,
      totalAmount,
    });
  } catch (e) {
    for (const undo of rollback.reverse()) {
      await undo().catch(() => undefined);
    }
    return res.status(500).json({ success: false, message: "Could not place order" });
  }
  emitToAdmin("pharmacy-order:new", { id: String(order._id), totalAmount });
  ok(res, order);
});
// Upload a prescription image/PDF for a pharmacy order → returns a URL the
// client passes back as `prescriptionUrl` when placing the order.
router.post("/pharmacy/prescription", verifyUserToken, recordsUpload.single("file"), async (req, res) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ success: false, message: "file is required" });
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const url = `${baseUrl}/uploads/medical-records/${path.basename(file.path)}`;
  ok(res, { url });
});
router.get("/pharmacy/orders", verifyUserToken, async (req, res) => {
  const list = await PharmacyOrder.find({ userId: uid(req) }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/pharmacy/orders/:id", verifyUserToken, async (req, res) => {
  const o = await PharmacyOrder.findOne({ _id: (req.params.id as string), userId: uid(req) }).lean();
  if (!o) return res.status(404).json({ success: false, message: "Order not found" });
  ok(res, o);
});
router.post("/pharmacy/orders/:id/cancel", verifyUserToken, async (req, res) => {
  const o: any = await PharmacyOrder.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!o) return res.status(404).json({ success: false, message: "Order not found" });
  if (["DELIVERED", "CANCELLED"].includes(o.status)) return ok(res, o.toObject());
  // Restock whatever was actually drawn — the exact batches for linked
  // lines (see returnFefo), or the legacy PharmacyProduct.stock counter
  // otherwise — so a cancelled order doesn't leave stock permanently short.
  for (const line of o.items || []) {
    if (line.itemId) {
      await returnFefo({
        itemId: line.itemId,
        drawn: (line.batchDraws || []).map((d: any) => ({ batchId: d.batchId, quantity: d.quantity })),
        legacyDrawn: line.legacyDrawnQty || 0,
      }).catch(() => undefined);
      await StockTransaction.create({
        itemId: line.itemId,
        type: "in",
        quantity: line.qty,
        balanceAfter: (await InventoryItem.findById(line.itemId).select("currentStock").lean() as any)?.currentStock ?? 0,
        reason: "Pharmacy order cancelled",
        performedByUserId: uid(req),
      }).catch(() => undefined);
    } else if (line.productId) {
      await PharmacyProduct.updateOne({ _id: line.productId }, { $inc: { stock: line.qty } }).catch(() => undefined);
    }
  }
  o.status = "CANCELLED";
  await o.save();
  emitToAdmin("pharmacy-order:updated", { id: String(o._id), status: "CANCELLED" });
  ok(res, o.toObject());
});

// ================== Lab tests (from DB) ==================
router.get("/lab/tests", async (req, res) => {
  const { q, category } = req.query as { q?: string; category?: string };
  const query: any = { isActive: true, isDeleted: false };
  if (category) query.category = category;
  if (q) query.name = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const list = await LabTest.find(query).sort({ name: 1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/lab/tests/:id", async (req, res) => {
  const t = await LabTest.findOne({ _id: (req.params.id as string), isDeleted: false }).lean();
  if (!t) return res.status(404).json({ success: false, message: "Test not found" });
  ok(res, t);
});
// Real, persisted lab bookings. Test prices captured from the catalog.
router.post("/lab/bookings", verifyUserToken, async (req, res) => {
  const b: any = req.body ?? {};
  const testIds: string[] = Array.isArray(b.testIds) ? b.testIds : [];
  if (testIds.length === 0) {
    return res.status(400).json({ success: false, message: "testIds are required" });
  }
  const found = await LabTest.find({ _id: { $in: testIds }, isDeleted: { $ne: true } }).lean();
  if (found.length === 0) {
    return res.status(400).json({ success: false, message: "No valid tests in booking" });
  }
  const tests = found.map((t: any) => ({ testId: t._id, name: t.name, price: t.price ?? 0 }));
  const totalAmount = tests.reduce((s, t) => s + t.price, 0);

  // Scheduled sample-collection time (date + slot).
  let scheduledAt: Date | undefined;
  let slotTime: string | undefined;
  let slotLabel: string | undefined;
  if (b.date && b.slot) {
    const when = slotToDate(String(b.date), String(b.slot));
    if (!when || when.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: "Please pick a valid future slot" });
    }
    scheduledAt = when;
    slotTime = String(b.slot);
    slotLabel = fullSlotLabel(String(b.date), String(b.slot));
  }

  const booking = await LabBooking.create({
    userId: uid(req),
    tests,
    addressId: b.addressId || undefined,
    familyMemberId: b.familyMemberId || undefined,
    slot: slotLabel || b.slot || undefined,
    scheduledAt,
    slotTime,
    slotLabel,
    totalAmount,
  });
  emitToAdmin("lab-booking:new", { id: String(booking._id), totalAmount });
  ok(res, booking);
});
router.get("/lab/bookings", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const list = await LabBooking.find(ownOrFamilyFilter(req, famIds)).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/lab/bookings/:id", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const bk = await LabBooking.findOne({ _id: (req.params.id as string), ...ownOrFamilyFilter(req, famIds) }).lean();
  if (!bk) return res.status(404).json({ success: false, message: "Lab booking not found" });
  ok(res, bk);
});
router.post("/lab/bookings/:id/cancel", verifyUserToken, async (req, res) => {
  const bk: any = await LabBooking.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!bk) return res.status(404).json({ success: false, message: "Lab booking not found" });
  if (["REPORT_READY", "CANCELLED"].includes(bk.status)) return ok(res, bk.toObject());
  bk.status = "CANCELLED";
  await bk.save();
  emitToAdmin("lab-booking:updated", { id: String(bk._id), status: "CANCELLED" });
  ok(res, bk.toObject());
});
// Patient reschedule — pick a new sample-collection date + slot.
router.post("/lab/bookings/:id/reschedule", verifyUserToken, async (req, res) => {
  const bk: any = await LabBooking.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!bk) return res.status(404).json({ success: false, message: "Lab booking not found" });
  if (["REPORT_READY", "CANCELLED"].includes(bk.status)) {
    return res.status(400).json({ success: false, message: "This booking can't be rescheduled" });
  }
  const when = slotToDate(String(req.body?.date || ""), String(req.body?.slot || ""));
  if (!when || when.getTime() <= Date.now()) {
    return res.status(400).json({ success: false, message: "Please pick a valid future slot" });
  }
  bk.scheduledAt = when;
  bk.slotTime = String(req.body.slot);
  bk.slotLabel = fullSlotLabel(String(req.body.date), String(req.body.slot));
  bk.slot = bk.slotLabel;
  await bk.save();
  emitToAdmin("lab-booking:updated", { id: String(bk._id), status: bk.status });
  ok(res, bk.toObject());
});

// ================== Medical records ==================
router.get("/medical-records", verifyUserToken, async (req, res) => {
  const { familyMemberId } = req.query as { familyMemberId?: string };
  // Explicit member filter → that member under my account. Otherwise show mine
  // PLUS anything recorded for me as a family member (e.g. my son uploaded it).
  const famIds = await familyMemberIdsFor(req);
  const query: any = familyMemberId
    ? { userId: uid(req), familyMemberId }
    : ownOrFamilyFilter(req, famIds);
  const list = await PatientMedicalRecord.find(query).sort({ createdAt: -1 }).lean();
  // Expose uploadedAt for the app (mirrors createdAt).
  res.json({
    success: true,
    data: list.map((r) => ({ ...r, uploadedAt: r.createdAt })),
    message: "ok",
  });
});

router.post(
  "/medical-records",
  verifyUserToken,
  recordsUpload.single("file"),
  async (req, res) => {
    const body: any = req.body ?? {};
    const file = (req as any).file as Express.Multer.File | undefined;
    const fileUrl = file
      ? ((await uploadFileToAws([file])).images as string)
      : body.fileUrl ?? "";
    const record = await PatientMedicalRecord.create({
      userId: uid(req),
      title: body.title ?? "Untitled",
      type: body.type ?? "other",
      familyMemberId: body.familyMemberId ?? null,
      notes: body.notes ?? null,
      fileUrl,
    });
    ok(res, { ...record.toObject(), uploadedAt: record.createdAt });
  }
);

router.get("/medical-records/:id", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const r = await PatientMedicalRecord.findOne({ _id: (req.params.id as string), ...ownOrFamilyFilter(req, famIds) }).lean();
  if (!r) {
    return res.status(404).json({ success: false, message: "Record not found" });
  }
  ok(res, { ...r, uploadedAt: r.createdAt });
});

router.delete("/medical-records/:id", verifyUserToken, async (req, res) => {
  await PatientMedicalRecord.deleteOne({ _id: (req.params.id as string), userId: uid(req) });
  ok(res);
});

// ================== Field / emergency clinical records ==================
// Two things, surfaced to the patient in their own app:
//   • patients   — HospitalPatient records ambulance staff registered in the
//                  field that got bound to THIS app user by phone match at
//                  registration (so the user can see which patient is theirs).
//   • caseNotes  — vitals / notes the crew captured during a dispatch. Case
//                  notes are keyed by `dispatchId` (an AmbulanceRequest or
//                  EmergencyDispatch id), so we resolve this user's own
//                  dispatches first and match notes against those ids.
router.get("/field-records", verifyUserToken, async (req, res) => {
  const userId = uid(req);

  const [patients, reqDocs, dispDocs] = await Promise.all([
    HospitalPatient.find({ appUserId: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean(),
    AmbulanceRequest.find({ userId }).select("_id").lean(),
    EmergencyDispatch.find({ patientUserId: userId }).select("_id").lean(),
  ]);

  const ownDispatchIds = [...reqDocs, ...dispDocs].map((d) => String(d._id));
  const notes = ownDispatchIds.length
    ? await StaffCaseNote.find({ dispatchId: { $in: ownDispatchIds } })
        .sort({ createdAt: -1 })
        .lean()
    : [];

  res.json({
    success: true,
    data: {
      patients: patients.map((p) => ({
        _id: p._id,
        patientId: p.patientId,
        fullName: p.fullName,
        gender: p.gender,
        phone: p.phone,
        registeredAt: p.createdAt,
      })),
      caseNotes: notes.map((n) => ({
        _id: n._id,
        vitals: n.vitals ?? null,
        notes: n.notes ?? null,
        recordedAt: n.createdAt,
      })),
    },
    message: "ok",
  });
});

// Reverse geocode (coords → structured address) using the SERVER Google key.
// The app's own key is restricted to the Maps SDK and can't call the Geocoding
// web service, so this runs server-side to fill city/state/pincode.
router.get("/geocode/reverse", verifyUserToken, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ success: false, message: "lat and lng are required" });
  }
  const result = await reverseGeocode(lat, lng);
  if (!result) return ok(res, null);
  return ok(res, result);
});

// Forward address search (type-to-find) — server key, so it actually returns
// results. Powers the pickup/drop "Search address" boxes.
router.get("/geocode/search", verifyUserToken, async (req, res) => {
  const q = String(req.query.q || "");
  return ok(res, await searchPlaces(q));
});

// Resolve a chosen suggestion (placeId or description) to coords + address.
router.get("/geocode/resolve", verifyUserToken, async (req, res) => {
  const placeId = req.query.placeId ? String(req.query.placeId) : undefined;
  const description = req.query.description ? String(req.query.description) : undefined;
  return ok(res, await resolvePlace({ placeId, description }));
});

// ================== Facilities ==================
// Hospitals/labs used to be dead stub routes here. The real facility
// locator already exists — Centre model + LocatorServiceType taxonomy (see
// seed-locator-service-types.ts) — and the patient app's centresApi already
// calls it directly (GET /centres?serviceType=&search=&lat=&lng=, GET
// /centres/service-types for the tab list). Removed the stubs rather than
// duplicate that query logic under a second URL nothing was calling.
//
// Real pharmacy locator (approved, active). Supports ?state=&district=
// &search= and ?lng=&lat=&radiusKm= proximity filters.
router.get("/facilities/pharmacies", async (req, res) => {
  const q: any = { status: "approved", isActive: true, isDeleted: false };
  if (req.query.state) q.state = req.query.state;
  if (req.query.district) q.district = req.query.district;
  const search = ((req.query.search as string) || "").trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ name: rx }, { address: rx }];
  }
  const lng = Number(req.query.lng);
  const lat = Number(req.query.lat);
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    q.location = {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: (Number(req.query.radiusKm) || 10) * 1000,
      },
    };
    return ok(res, await Pharmacy.find(q).limit(100).lean());
  }
  return ok(res, await Pharmacy.find(q).sort({ rating: -1 }).limit(100).lean());
});

// ================== Home feed ==================
// Real content aggregated from data that already exists elsewhere in the
// app (no new speculative models): the same admin-managed promos the home
// screen already shows as banners, a fixed set of quick-links to real
// screens, this patient's nearest upcoming OPD appointment (ambulance rides
// are immediate-dispatch, not scheduled, so OPD is the real "upcoming"
// concept here), and a couple of first-aid guides as health suggestions.
router.get("/home/feed", verifyUserToken, async (req, res) => {
  const patientIds = await myHospitalPatientIds(req);
  const [banners, upcomingAppt, suggestions] = await Promise.all([
    HomePromo.find({ isActive: true }).sort({ sortOrder: 1 }).limit(10).lean(),
    patientIds.length
      ? Appointment.findOne({
          patientId: { $in: patientIds },
          status: "booked",
          scheduledAt: { $gte: new Date() },
        })
          .sort({ scheduledAt: 1 })
          .populate("doctorId", "fullName")
          .lean()
      : null,
    FirstAidGuide.find({ isActive: true, isDeleted: { $ne: true } })
      .sort({ sortOrder: 1 })
      .limit(3)
      .lean(),
  ]);
  ok(res, {
    banners: banners.map((p: any) => ({
      _id: String(p._id),
      titleTop: p.titleTop,
      titleBold: p.titleBold || [],
      cta: p.cta || "Book Now",
      target: p.target,
      image: p.image || null,
    })),
    shortcuts: [
      { key: "hospitals", label: "Hospitals", route: "CentresList", params: { serviceType: "hospitals" } },
      { key: "labs", label: "Labs", route: "CentresList", params: { serviceType: "labs" } },
      { key: "firstAid", label: "First Aid", route: "FirstAid", params: null },
      { key: "insurance", label: "My Insurance", route: "Insurance", params: null },
    ],
    upcoming: upcomingAppt
      ? [
          {
            _id: String((upcomingAppt as any)._id),
            type: "opd_appointment",
            scheduledAt: (upcomingAppt as any).scheduledAt,
            doctorName: (upcomingAppt as any).doctorId?.fullName || null,
            tokenNumber: (upcomingAppt as any).tokenNumber,
          },
        ]
      : [],
    suggestions: suggestions.map((g: any) => ({
      _id: String(g._id),
      title: g.title,
      category: g.category || "",
      thumbnailUrl: g.thumbnailUrl || null,
    })),
  });
});
router.get("/home/banners", async (_req, res) => {
  const banners = await HomePromo.find({ isActive: true }).sort({ sortOrder: 1 }).limit(10).lean();
  ok(res, banners);
});

// First-aid / emergency education content (admin-managed, public).
router.get("/first-aid", async (_req, res) => {
  const items = await FirstAidGuide.find({ isActive: true, isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  res.json({
    success: true,
    data: items.map((g) => ({
      _id: String(g._id),
      title: g.title,
      category: g.category || "",
      type: g.type,
      videoUrl: g.videoUrl || null,
      thumbnailUrl: g.thumbnailUrl || null,
      content: g.content || null,
      durationLabel: g.durationLabel || null,
    })),
    message: "ok",
  });
});

// Admin-managed home promo shortcut cards (real, ordered).
router.get("/home/promos", async (_req, res) => {
  const promos = await HomePromo.find({ isActive: true, isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  res.json({
    success: true,
    data: promos.map((p) => ({
      _id: String(p._id),
      titleTop: p.titleTop,
      titleBold: p.titleBold,
      cta: p.cta,
      target: p.target,
      image: p.image || null,
    })),
    message: "ok",
  });
});

// ================== Membership ==================
// Admin-managed plans + the user's active subscription.
router.get("/membership/plans", async (_req, res) => {
  const plans = await MembershipPlan.find({ isActive: true, isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, price: 1 })
    .lean();
  res.json({
    success: true,
    data: plans.map((p) => ({
      _id: String(p._id),
      tier: p.tier,
      name: p.name,
      price: p.price,
      durationMonths: p.durationMonths,
      concessionPercent: p.concessionPercent ?? 0,
      bullets: p.bullets || [],
    })),
    message: "ok",
  });
});

// The user's current active membership (null if none) — drives the "active
// plan" card with real enrolment/validity + live family-member count.
router.get("/membership", verifyUserToken, async (req, res) => {
  const m: any = await UserMembership.findOne({ userId: uid(req), status: "active" })
    .sort({ createdAt: -1 })
    .lean();
  if (!m) return ok(res, null);
  const familyCount = await PatientFamilyMember.countDocuments({ userId: uid(req) });
  ok(res, {
    _id: String(m._id),
    planName: m.planName,
    tier: m.tier,
    enrolledAt: m.enrolledAt,
    validUpto: m.validUpto,
    familyCount,
    status: m.status,
  });
});

// Enroll into a plan. Payment is handled separately (mock for now); this records
// the membership with a real validity window derived from the plan duration.
router.post("/membership/enroll", verifyUserToken, async (req, res) => {
  const planId = (req.body?.planId as string) || "";
  const plan: any = await MembershipPlan.findOne({ _id: planId, isActive: true, isDeleted: { $ne: true } }).lean();
  if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
  const enrolledAt = new Date();
  const validUpto = new Date(enrolledAt);
  validUpto.setMonth(validUpto.getMonth() + (plan.durationMonths || 12));
  // One active membership per user — supersede any prior active one.
  await UserMembership.updateMany(
    { userId: uid(req), status: "active" },
    { $set: { status: "cancelled" } },
  );
  const m = await UserMembership.create({
    userId: uid(req),
    planId: plan._id,
    planName: plan.name,
    tier: plan.tier,
    enrolledAt,
    validUpto,
    status: "active",
  });
  ok(res, m);
});

// ================== Hospital (HMS) patient portal ==================
// The patient app is linked to its hospital record(s) by phone number — the app
// User and the HMS HospitalPatient are separate entities, joined on the last 10
// digits of the mobile so country-code/spacing differences don't break it.

/** All HospitalPatient _ids linked to a given phone (last-10-digit match). */
const hospitalPatientIdsForPhone = async (phone?: string): Promise<any[]> => {
  const last10 = String(phone || "").replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return [];
  const patients = await HospitalPatient.find({
    phone: { $regex: `${last10}$` },
    isDeleted: { $ne: true },
  })
    .select("_id")
    .lean();
  return patients.map((p: any) => p._id);
};

/**
 * The logged-in user's family group: the head (whoever's phone the family
 * was built around) plus every user auto-linked under them — see
 * user.service.ts#addUsers. A user with no dependents/head is their own
 * one-person group.
 */
const familyMembers = async (req: Request): Promise<any[]> => {
  const me: any = await User.findById(uid(req)).select("headUserId").lean();
  const headId = me?.headUserId || uid(req);
  return User.find({
    $or: [{ _id: headId }, { headUserId: headId }],
    isDeleted: { $ne: true },
  })
    .select("_id fullName mobileNumber gender profileImage headUserId")
    .lean();
};

/**
 * All HospitalPatient _ids that belong to the logged-in app user (by phone) —
 * or, if `?patientUserId=` names another member of the SAME family group,
 * that member's instead. Lets the app reuse these self-scoped HMS/insurance
 * routes to view a family member's records via one "view as" picker, without
 * duplicating every route. Unknown/non-family ids are silently denied (empty
 * result), never leaked.
 */
const myHospitalPatientIds = async (req: Request): Promise<any[]> => {
  const targetUserId = String(req.query.patientUserId || "").trim();
  if (targetUserId && targetUserId !== String(uid(req))) {
    const members = await familyMembers(req);
    const target = members.find((m: any) => String(m._id) === targetUserId);
    if (!target) return [];
    return hospitalPatientIdsForPhone(target.mobileNumber);
  }
  const user: any = await User.findById(uid(req)).select("mobileNumber").lean();
  return hospitalPatientIdsForPhone(user?.mobileNumber);
};

/** Find (or create, for booking) the user's primary hospital record. */
const ensureHospitalPatient = async (req: Request): Promise<any> => {
  const user: any = await User.findById(uid(req)).lean();
  const last10 = String(user?.mobileNumber || "").replace(/\D/g, "").slice(-10);
  let hp: any = last10.length === 10
    ? await HospitalPatient.findOne({ phone: { $regex: `${last10}$` }, isDeleted: { $ne: true } })
    : null;
  if (!hp) {
    // HospitalPatient requires a human-readable patientId (HWP-…) and a
    // lowercase gender enum (male|female|other) — the app stores "Male"/etc., so
    // normalise. Without these the create failed validation ("Could not book").
    const seq = await nextSequence("hospital_patient");
    const g = String(user?.gender || "").toLowerCase();
    hp = await HospitalPatient.create({
      patientId: `HWP-${String(seq).padStart(6, "0")}`,
      fullName: user?.fullName || "Patient",
      phone: user?.mobileNumber || "",
      gender: (["male", "female", "other"].includes(g) ? g : undefined) as
        | "male"
        | "female"
        | "other"
        | undefined,
      appUserId: uid(req),
      source: "patient_app" as const,
    });
  }
  return hp;
};

// Whole-family view: self + every auto-linked dependent (or, for a
// dependent, self + head + siblings), each with their real hospital spend
// and insurance coverage — like a real family health-insurance/hospital
// portal where any member can see the household's combined picture. Numbers
// come from the exact same HospitalInvoice/PatientPolicy/InsuranceClaim data
// each member's own /hms/invoices and /insurance already show; this just
// aggregates it across the family group instead of one phone at a time.
router.get("/family/overview", verifyUserToken, async (req, res) => {
  const meId = String(uid(req));
  const members = await familyMembers(req);
  const me: any = members.find((m: any) => String(m._id) === meId);
  const headId = String(me?.headUserId || meId);

  // Relation labels come from the head's own family-member rows (the only
  // place a relation like "Wife"/"Son" is recorded), matched by linkedUserId.
  const famRows = await PatientFamilyMember.find({
    userId: headId,
    linkedUserId: { $exists: true },
  })
    .select("relation linkedUserId")
    .lean();
  const relationByUserId = new Map(famRows.map((f: any) => [String(f.linkedUserId), f.relation]));

  const results = await Promise.all(
    members.map(async (m: any) => {
      const ids = await hospitalPatientIdsForPhone(m.mobileNumber);
      const [invoiceAgg, policies] = await Promise.all([
        ids.length
          ? HospitalInvoice.aggregate([
              { $match: { patientId: { $in: ids } } },
              {
                $group: {
                  _id: null,
                  totalBilled: { $sum: "$total" },
                  totalPaid: { $sum: "$amountPaid" },
                  balanceDue: { $sum: "$balanceDue" },
                  count: { $sum: 1 },
                },
              },
            ])
          : [],
        ids.length
          ? PatientPolicy.find({ patientId: { $in: ids }, isActive: true }).select("_id sumInsured").lean()
          : [],
      ]);
      const billing = invoiceAgg[0] || { totalBilled: 0, totalPaid: 0, balanceDue: 0, count: 0 };

      let totalUsed = 0;
      let totalSumInsured = 0;
      if (policies.length) {
        const policyIds = policies.map((p: any) => p._id);
        const claims = await InsuranceClaim.find({
          policyId: { $in: policyIds },
          status: { $in: ["approved", "settled"] },
        })
          .select("approvedAmount claimedAmount")
          .lean();
        totalUsed = claims.reduce((s: number, c: any) => s + (c.approvedAmount || c.claimedAmount || 0), 0);
        totalSumInsured = policies.reduce((s: number, p: any) => s + (p.sumInsured || 0), 0);
      }

      return {
        userId: String(m._id),
        fullName: m.fullName || "Family member",
        phone: m.mobileNumber,
        isSelf: String(m._id) === meId,
        isHead: String(m._id) === headId,
        relation: String(m._id) === headId ? null : relationByUserId.get(String(m._id)) || null,
        billing: {
          totalBilled: billing.totalBilled || 0,
          totalPaid: billing.totalPaid || 0,
          balanceDue: billing.balanceDue || 0,
          invoiceCount: billing.count || 0,
        },
        insurance: {
          hasPolicy: policies.length > 0,
          totalSumInsured,
          totalUsed,
          totalRemaining: Math.max(0, totalSumInsured - totalUsed),
        },
      };
    }),
  );

  const familyTotal = results.reduce(
    (acc, r) => ({
      totalBilled: acc.totalBilled + r.billing.totalBilled,
      totalPaid: acc.totalPaid + r.billing.totalPaid,
      balanceDue: acc.balanceDue + r.billing.balanceDue,
    }),
    { totalBilled: 0, totalPaid: 0, balanceDue: 0 },
  );

  ok(res, { members: results, familyTotal });
});

// Quick summary: is a hospital record linked + counts for the dashboard tiles.
router.get("/hms/summary", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, { linked: false });
  const [appointments, prescriptions, labOrders, invoices, admissions] = await Promise.all([
    Appointment.countDocuments({ patientId: { $in: ids } }),
    EmrEncounter.countDocuments({ patientId: { $in: ids }, status: "finalized" }),
    DiagnosticOrder.countDocuments({ patientId: { $in: ids } }),
    HospitalInvoice.countDocuments({ patientId: { $in: ids } }),
    Admission.countDocuments({ patientId: { $in: ids } }),
  ]);
  ok(res, { linked: true, appointments, prescriptions, labOrders, invoices, admissions });
});

// OPD appointments (view).
router.get("/hms/appointments", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, []);
  const rows: any[] = await Appointment.find({ patientId: { $in: ids } })
    .sort({ scheduledAt: -1 })
    .limit(100)
    .populate("doctorId", "fullName doctorProfile.speciality")
    .lean();
  ok(res, rows.map((a) => ({
    _id: String(a._id),
    doctorName: a.doctorId?.fullName || "Doctor",
    speciality: a.doctorId?.doctorProfile?.speciality || "",
    scheduledAt: a.scheduledAt,
    tokenNumber: a.tokenNumber,
    status: a.status,
    reason: a.reason || "",
  })));
});

// Prescriptions + diagnoses from finalized EMR encounters.
router.get("/hms/prescriptions", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, []);
  const rows: any[] = await EmrEncounter.find({ patientId: { $in: ids }, status: "finalized" })
    .sort({ visitDate: -1 })
    .limit(100)
    .populate("doctorId", "fullName doctorProfile.speciality")
    .lean();
  ok(res, rows.map((e) => ({
    _id: String(e._id),
    doctorName: e.doctorId?.fullName || "Doctor",
    visitDate: e.visitDate,
    encounterType: e.encounterType,
    // Show structured ICD diagnoses if present, else legacy free-text list.
    diagnoses:
      Array.isArray(e.icdDiagnoses) && e.icdDiagnoses.length
        ? e.icdDiagnoses.map((d: any) => (d.code ? `${d.text} (${d.code})` : d.text))
        : e.diagnoses || [],
    severity: e.severity || undefined,
    treatmentPlan: e.treatmentPlan || undefined,
    followUpAt: e.followUpAt || undefined,
    prescriptions: (e.prescriptions || []).map((p: any) => ({
      drug: p.drug,
      dose: p.dosage || p.dose,
      frequency: p.frequency,
      duration: p.duration,
    })),
  })));
});

// Lab + imaging orders with results/reports.
router.get("/hms/lab-orders", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, []);
  const rows: any[] = await DiagnosticOrder.find({ patientId: { $in: ids } })
    .sort({ orderedAt: -1 })
    .limit(100)
    .lean();
  ok(res, rows.map((d) => ({
    _id: String(d._id),
    category: d.category,
    name: d.name,
    status: d.status,
    resultValue: d.resultValue || "",
    resultNotes: d.resultNotes || "",
    reports: (d.attachments || []).map((f: any) => ({ url: f.url, label: f.label })),
    orderedAt: d.orderedAt,
    reportedAt: d.reportedAt || null,
  })));
});

// Hospital bills/invoices.
router.get("/hms/invoices", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, []);
  const rows: any[] = await HospitalInvoice.find({ patientId: { $in: ids } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  // Surface any insurance claim raised against each bill (incl. the
  // auto-drafted ones — see billing.controller.ts#autoDraftClaimForInvoice)
  // right on the bill itself, instead of a patient with a balance due
  // having no way to know insurance already covers it, or could.
  const claims: any[] = rows.length
    ? await InsuranceClaim.find({ invoiceId: { $in: rows.map((r) => r._id) } })
        .select("invoiceId claimNumber status claimedAmount approvedAmount")
        .lean()
    : [];
  const claimByInvoice = new Map(claims.map((c: any) => [String(c.invoiceId), c]));
  // A patient can hold an active policy but still have no claim on a given
  // bill (e.g. 2+ active policies — auto-draft skips ambiguous cases and
  // leaves it for a human to pick) — surface that too so the UI can prompt
  // "you're insured, check coverage" instead of looking uninsured.
  const hasActivePolicy = !!(await PatientPolicy.exists({ patientId: { $in: ids }, isActive: true }));
  ok(res, rows.map((inv) => {
    const claim: any = claimByInvoice.get(String(inv._id));
    return {
      _id: String(inv._id),
      invoiceNo: inv.invoiceNo,
      total: inv.total,
      amountPaid: inv.amountPaid,
      balanceDue: inv.balanceDue,
      status: inv.status,
      createdAt: inv.createdAt,
      hasActivePolicy,
      items: (inv.lineItems || []).map((it: any) => ({
        description: it.description,
        section: it.section,
        quantity: it.quantity,
        amount: it.amount,
      })),
      claim: claim
        ? {
            claimNumber: claim.claimNumber,
            status: claim.status,
            claimedAmount: claim.claimedAmount,
            approvedAmount: claim.approvedAmount,
          }
        : null,
    };
  }));
});

// IPD admissions + discharge summaries.
router.get("/hms/admissions", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, []);
  const rows: any[] = await Admission.find({ patientId: { $in: ids } })
    .sort({ admittedAt: -1 })
    .limit(50)
    .lean();
  ok(res, rows.map((a) => ({
    _id: String(a._id),
    ward: a.ward,
    bedNumber: a.bedNumber,
    reason: a.reason || "",
    status: a.status,
    admittedAt: a.admittedAt,
    dischargedAt: a.dischargedAt || null,
    dischargeSummary: a.dischargeSummary || "",
  })));
});

// Available OPD slots for a doctor on a date (?date=YYYY-MM-DD). Empty list
// means the doctor has no published schedule for that weekday (the app then
// falls back to a free date/time pick).
router.get("/hms/doctors/:id/slots", verifyUserToken, async (req, res) => {
  const dateStr = String(req.query.date || "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) return res.status(400).json({ success: false, message: "Invalid date" });
  const hasSchedule = await DoctorSchedule.exists({ doctorId: req.params.id, isActive: true });
  const slots = await getDoctorSlots(req.params.id as string, date);
  ok(res, { hasSchedule: !!hasSchedule, slots });
});

// Book an OPD appointment with a hospital doctor. Auto-links/creates the
// patient's hospital record and assigns the next queue token for that doctor's
// day — so it shows up live on the admin OPD board.
router.post("/hms/appointments", verifyUserToken, async (req, res) => {
  const doctorId = String(req.body?.doctorId || "");
  const whenStr = String(req.body?.scheduledAt || "");
  const reason = req.body?.reason ? String(req.body.reason) : undefined;
  const doctor: any = await Admin.findOne({ _id: doctorId, roleName: "Doctor", isDeleted: false }).lean();
  if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });
  const scheduledAt = whenStr ? new Date(whenStr) : new Date();
  if (isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ success: false, message: "Invalid date" });
  }
  // If the doctor publishes a schedule, the chosen time must be a free slot —
  // this prevents double-booking and out-of-hours bookings.
  const hasSchedule = await DoctorSchedule.exists({ doctorId: doctor._id, isActive: true });
  if (hasSchedule && !(await isSlotAvailable(doctor._id, scheduledAt))) {
    return res.status(409).json({ success: false, message: "That slot is no longer available. Please pick another." });
  }
  const hp = await ensureHospitalPatient(req);
  // Next token for this doctor on the scheduled calendar day.
  const dayStart = new Date(scheduledAt); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduledAt); dayEnd.setHours(23, 59, 59, 999);
  const todays = await Appointment.countDocuments({
    doctorId: doctor._id,
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
  });
  const appt = await Appointment.create({
    patientId: hp._id,
    doctorId: doctor._id,
    scheduledAt,
    tokenNumber: todays + 1,
    status: "booked",
    reason,
    createdByAdminId: doctor._id, // self-service booking; attributed to the doctor
  });
  ok(res, {
    _id: String(appt._id),
    doctorName: doctor.fullName,
    scheduledAt: appt.scheduledAt,
    tokenNumber: appt.tokenNumber,
    status: appt.status,
  });
});

// ================== Insurance ==================
// Real integration with the hospital billing module's insurance module
// (admin/src/pages/InsuranceManagement.tsx, backend/src/models/insurance.model.ts)
// — the patient self-registers a policy (like handing over your insurance
// card), and this surfaces the SAME claims hospital billing staff raise +
// approve/settle against it. Claim approval/settlement stays admin-only;
// this is read + self-service "add my policy" only.

// Active insurers/TPAs for the add-policy picker.
router.get("/insurance/payers", verifyUserToken, async (_req, res) => {
  const items = await InsurancePayer.find({ isActive: true, isDeleted: { $ne: true } })
    .sort({ name: 1 })
    .select("name type")
    .lean();
  ok(res, items.map((p: any) => ({ _id: String(p._id), name: p.name, type: p.type })));
});

// My policies + remaining coverage, computed from the same claims hospital
// billing staff process (approved/settled claims reduce the balance — a
// settled claim already posts a real payment onto the linked hospital
// invoice, so this reflects real usage, not a self-reported number).
router.get("/insurance", verifyUserToken, async (req, res) => {
  const ids = await myHospitalPatientIds(req);
  if (ids.length === 0) return ok(res, []);

  const policies = await PatientPolicy.find({ patientId: { $in: ids } })
    .sort({ createdAt: -1 })
    .populate("payerId", "name type")
    .lean();
  if (!policies.length) return ok(res, []);

  const policyIds = policies.map((p: any) => p._id);
  const claims = await InsuranceClaim.find({ policyId: { $in: policyIds } })
    .sort({ createdAt: -1 })
    .lean();
  const claimsByPolicy = new Map<string, any[]>();
  for (const c of claims) {
    const k = String(c.policyId);
    if (!claimsByPolicy.has(k)) claimsByPolicy.set(k, []);
    claimsByPolicy.get(k)!.push(c);
  }

  ok(
    res,
    policies.map((p: any) => {
      const pClaims = claimsByPolicy.get(String(p._id)) || [];
      const used = pClaims
        .filter((c) => c.status === "approved" || c.status === "settled")
        .reduce((s, c) => s + (c.approvedAmount || c.claimedAmount || 0), 0);
      const pending = pClaims
        .filter((c) => c.status === "submitted")
        .reduce((s, c) => s + (c.claimedAmount || 0), 0);
      const sumInsured = p.sumInsured || 0;
      return {
        _id: String(p._id),
        payerName: p.payerId?.name || "Insurer",
        payerType: p.payerId?.type || "insurer",
        policyNumber: p.policyNumber,
        holderName: p.holderName || "",
        sumInsured,
        used,
        pending,
        remaining: Math.max(0, sumInsured - used),
        validFrom: p.validFrom || null,
        validTo: p.validTo || null,
        isActive: p.isActive,
        claims: pClaims.map((c) => ({
          _id: String(c._id),
          claimNumber: c.claimNumber,
          amount: c.approvedAmount || c.claimedAmount || 0,
          status: c.status,
          createdAt: c.createdAt,
          settledAt: c.settledAt || null,
        })),
      };
    }),
  );
});

// Self-service "add my insurance" — same PatientPolicy hospital billing staff
// create, just patient-originated. Links to (or creates) the patient's
// HospitalPatient record the same way OPD booking does.
router.post("/insurance", verifyUserToken, async (req, res) => {
  const b = req.body || {};
  const payerId = String(b.payerId || "");
  const policyNumber = String(b.policyNumber || "").trim();
  if (!payerId || !policyNumber) {
    return res.status(400).json({ success: false, message: "payerId and policyNumber are required" });
  }
  const payer = await InsurancePayer.findOne({ _id: payerId, isActive: true, isDeleted: { $ne: true } }).lean();
  if (!payer) return res.status(400).json({ success: false, message: "Invalid insurer selected" });

  const hp = await ensureHospitalPatient(req);
  const policy = await PatientPolicy.create({
    patientId: hp._id,
    payerId,
    policyNumber,
    holderName: b.holderName ? String(b.holderName).trim() : undefined,
    sumInsured: Number(b.sumInsured) || 0,
    validFrom: b.validFrom ? new Date(b.validFrom) : undefined,
    validTo: b.validTo ? new Date(b.validTo) : undefined,
  });
  ok(res, { _id: String(policy._id) });
});

// ================== Ambulance ==================
// Ambulance "types" are the admin-managed VehicleTypes (Types & Pricing page).
// One source of truth for both the admin panel and the patient app.
const toAppType = (t: any) => ({
  _id: String(t._id),
  // App round-trips this as `type` when booking; we accept the id (or name).
  code: String(t._id),
  name: t.name,
  description: t.description || "",
  priceFrom: t.baseFare,
  perKmRate: t.perKmRate,
  icon: t.icon || "",
  image: t.image || "",
  maxRangeKm: t.maxRangeKm,
  etaMinutes: null,
});

// Resolve the chosen type — the app may send a VehicleType _id or a name.
const resolveVehicleType = async (type?: string) => {
  if (!type) return null;
  if (Types.ObjectId.isValid(type)) {
    const byId = await VehicleType.findOne({ _id: type, isDeleted: { $ne: true } });
    if (byId) return byId;
  }
  return VehicleType.findOne({
    name: new RegExp(`^${String(type).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    isDeleted: { $ne: true },
  });
};

// Compute a real fare for a trip leg using the fare engine (distance-aware,
// surge/GST included). Returns null if the type can't be resolved.
const quoteFor = async (vt: any, pickup?: any, drop?: any) => {
  const distanceKm = haversineKm(pickup, drop) ?? 0;
  const durationMin = etaMinutesFromKm(distanceKm) ?? 0;
  const breakdown = await calculateFare({
    vehicleTypeId: vt._id,
    distanceKm,
    durationMin,
    serviceType: "WITHIN_CITY",
  });
  return {
    distanceKm,
    durationMin,
    amount: breakdown.finalFare,
    breakdown,
  };
};

router.get("/ambulance/types", async (_req, res) => {
  const types = await VehicleType.find({ category: "ambulance", isActive: true, isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  res.json({ success: true, data: types.map(toAppType), message: "ok" });
});

// Per-type real fare estimates for a pickup→drop leg. Powers the
// "Select Ambulance" list so each option shows a real, distance-based price.
router.post("/ambulance/quotes", verifyUserToken, async (req, res) => {
  const { pickup, drop } = req.body ?? {};
  const types = await VehicleType.find({ category: "ambulance", isActive: true, isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  const items = await Promise.all(
    types.map(async (t) => {
      // One type's fare failing (e.g. distance API hiccup) must NOT empty the
      // whole list — fall back to the type's base/from price so the patient
      // always sees every ambulance option.
      try {
        const q = await quoteFor(t, pickup, drop);
        return { ...toAppType(t), amount: q.amount, distanceKm: q.distanceKm, etaMinutes: q.durationMin || null };
      } catch {
        const base = toAppType(t);
        return { ...base, amount: base.priceFrom ?? t.baseFare ?? 0, distanceKm: null, etaMinutes: null };
      }
    }),
  );
  ok(res, { items, currency: "INR" });
});

// Single real estimate for a chosen type (or the cheapest active type).
router.post("/ambulance/estimate", verifyUserToken, async (req, res) => {
  const { pickup, drop, type } = req.body ?? {};
  let vt = await resolveVehicleType(type);
  if (!vt) {
    vt = await VehicleType.findOne({ category: "ambulance", isActive: true, isDeleted: { $ne: true } }).sort({ baseFare: 1 });
  }
  if (!vt) return res.status(404).json({ success: false, message: "No ambulance types configured" });
  const q = await quoteFor(vt, pickup, drop);
  ok(res, {
    amount: q.amount,
    currency: "INR",
    distanceKm: q.distanceKm,
    etaMinutes: q.durationMin || null,
    vehicleTypeId: String(vt._id),
    type: vt.name,
    breakdown: q.breakdown,
  });
});

// Validate an ambulance promo code against a quoted fare, BEFORE booking. The
// app calls this when the patient taps "Apply" so it can show the discount and
// the new payable amount up front. This only previews — actual redemption (the
// usage record + counter bump) happens at /ambulance/book time so abandoned
// checkouts never burn a code.
router.post("/ambulance/apply-promo", verifyUserToken, async (req, res) => {
  const { code, amount, type } = req.body ?? {};
  if (!code || typeof amount !== "number") {
    return res.status(400).json({ success: false, message: "code and amount are required" });
  }
  const vt = await resolveVehicleType(type);
  const result = await PromoService.validatePromoCode(
    String(code),
    new Types.ObjectId(uid(req)),
    amount,
    vt?._id,
    undefined,
    "AMBULANCE",
  );
  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.error });
  }
  ok(res, {
    valid: true,
    code: String(code).toUpperCase(),
    discountAmount: result.discountAmount,
    finalAmount: Math.max(0, Math.round((amount - (result.discountAmount || 0)) * 100) / 100),
    description: result.promo?.description,
  });
});

// Real, persisted ambulance requests. The admin dispatch screen assigns an
// ambulance + driver; on assignment the user is pushed (FCM) + socket-notified
// and the app flips to live tracking. `toApp` shapes the record for the app.
const ACTIVE_STATUSES = ["SEARCHING", "ASSIGNED", "ARRIVED", "ON_TRIP"];

// Patient cancellation is FREE while still "Searching" (no ambulance committed
// yet); once an ambulance is assigned (ASSIGNED/ARRIVED/ON_TRIP), a charge
// applies. The fee comes from the chosen VehicleType (admin-configurable),
// falling back to the global default.
const CHARGEABLE_CANCEL_STATUSES = ["ASSIGNED", "ARRIVED", "ON_TRIP"];

const cancellationFeeFor = async (r: any): Promise<number> => {
  if (!CHARGEABLE_CANCEL_STATUSES.includes(String(r.status))) return 0;
  let fee = 0;
  if (r.vehicleTypeId) {
    const vt: any = await VehicleType.findById(r.vehicleTypeId).select("cancellationFee").lean();
    fee = Number(vt?.cancellationFee) || 0;
  }
  if (!fee) fee = config.fare.defaultCancellationCharge || 0;
  return fee;
};

const toApp = (r: any) => {
  // Live straight-line distance from the patient pickup to the ambulance's
  // last reported position (null until both coordinates exist).
  const distanceKm = haversineKm(r.pickup, r.driverLocation);
  const liveEta = etaMinutesFromKm(distanceKm);
  return {
    _id: r._id,
    type: r.type || "Ambulance",
    status: String(r.status || "SEARCHING").toLowerCase(),
    emergency: !!r.emergency,
    pickup: r.pickup || null,
    drop: r.drop || null,
    patientName: r.patientName || null,
    notes: r.notes || null,
    contactId: r.contactId ? String(r.contactId) : null,
    recipientName: r.recipientName || null,
    recipientPhone: r.recipientPhone || null,
    driver: r.driverName ? { name: r.driverName, phone: r.driverPhone } : null,
    vehicle: r.vehicleNumber ? { number: r.vehicleNumber } : null,
    otp: r.otp || null,
    // Prefer the live, distance-derived ETA once we have the ambulance's
    // position; otherwise fall back to the admin's assignment estimate.
    etaMinutes: liveEta ?? r.etaMinutes ?? null,
    driverLocation: r.driverLocation || null,
    // Live straight-line distance to the ambulance (for tracking); falls back
    // to the trip distance captured at booking time.
    distanceKm: distanceKm ?? r.distanceKm ?? null,
    // Real fare computed at booking time (drives the price breakup UI).
    amount: r.amount ?? null,
    fareBreakdown: r.fareBreakdown ?? null,
    // Promo applied at booking: gross (pre-discount) fare + the savings, so the
    // breakup can show "Fare ₹X − Promo ₹Y = ₹Z".
    grossAmount: r.grossAmount ?? r.amount ?? null,
    discountAmount: r.discountAmount ?? 0,
    promoCode: r.promoCode ?? null,
    // In-transit medical expenses logged by the control room, billed on top of
    // the ambulance fare. grandTotal = ambulance amount + these.
    inTransitExpenses: Array.isArray(r.inTransitExpenses)
      ? r.inTransitExpenses.map((e: any) => ({
          item: e.item,
          qty: e.qty,
          rate: e.rate,
          amount: e.amount,
        }))
      : [],
    inTransitTotal: r.inTransitTotal ?? 0,
    grandTotal: r.grandTotal ?? r.amount ?? null,
    paymentStatus: r.paymentStatus || "PENDING",
    // Actual distance driven for this trip (dispatch point → pickup →
    // hospital), accumulated live from location pings — distinct from the
    // booking-time estimate in `distanceKm` above.
    tripDistanceKm: r.actualDistanceKm ?? null,
    // Final fare recomputed from the actual route at trip completion. Null
    // until the trip is COMPLETED — the UI should show `amount` as the
    // estimate until this is present, then show this as the final bill.
    actualFareAmount: r.actualFareAmount ?? null,
    actualFareBreakdown: r.actualFareBreakdown ?? null,
    // Photos/videos of the patient captured by the crew during transport.
    patientMedia: Array.isArray(r.patientMedia)
      ? r.patientMedia.map((m: any) => ({
          url: m.url,
          type: m.type,
          uploadedAt: m.uploadedAt,
        }))
      : [],
    lastLocationAt: r.lastLocationAt || null,
    // Cancellation details (for the "what happened" booking detail).
    cancelledBy: r.cancelledBy || null,
    cancelReason: r.cancelReason || null,
    cancelledAt: r.cancelledAt || null,
    cancellationCharge: r.cancellationCharge ?? 0,
    rating: r.rating ?? null,
    review: r.review || null,
    // Lifecycle timeline.
    statusHistory: Array.isArray(r.statusHistory)
      ? r.statusHistory.map((h: any) => ({
          status: String(h.status || "").toLowerCase(),
          at: h.at,
          by: h.by || null,
          note: h.note || null,
        }))
      : [],
    assignedAt: r.assignedAt || null,
    completedAt: r.completedAt || null,
    createdAt: r.createdAt,
  };
};

const createAmbulanceRequest = async (req: Request, emergency: boolean) => {
  const b: any = req.body ?? {};
  // "Book for someone else": the patient may send a saved contact (contactId)
  // plus the recipient's name/phone. We mirror the recipient name into
  // patientName so the existing admin/driver "who is this for" display works
  // without changes, and keep the structured recipient fields too.
  const recipientName = b.recipientName || b.patientName || undefined;
  // Resolve the chosen ambulance type and compute the real fare up front so the
  // patient sees a true price breakup on the tracking screen (no placeholders).
  const vt = await resolveVehicleType(b.type);
  let amount: number | undefined;
  let fareBreakdown: any | undefined;
  let distanceKm: number | undefined;
  let etaMinutes: number | undefined;
  if (vt) {
    const q = await quoteFor(vt, b.pickup, b.drop);
    amount = q.amount;
    fareBreakdown = q.breakdown;
    distanceKm = q.distanceKm;
    etaMinutes = q.durationMin || undefined;
  }

  // Apply a promo code if the patient entered one. We re-validate server-side
  // (never trust a client-sent discount) against the freshly computed fare, then
  // keep both the gross fare and the net payable so the price breakup is honest.
  let grossAmount: number | undefined = amount;
  let discountAmount = 0;
  let promoCodeId: Types.ObjectId | undefined;
  let promoCode: string | undefined;
  let appliedPromo: any = null;
  if (b.promoCode && typeof amount === "number") {
    const v = await PromoService.validatePromoCode(
      String(b.promoCode),
      new Types.ObjectId(uid(req)),
      amount,
      vt?._id,
      undefined,
      "AMBULANCE",
    );
    if (v.valid && v.promo) {
      discountAmount = v.discountAmount || 0;
      amount = Math.max(0, Math.round((amount - discountAmount) * 100) / 100);
      promoCodeId = v.promo._id;
      promoCode = v.promo.code;
      appliedPromo = v.promo;
    }
    // Invalid/expired codes are silently ignored at book time — the patient
    // already saw validity via /ambulance/apply-promo; we never block a booking
    // (especially an emergency) over a bad coupon.
  }

  const r = await AmbulanceRequest.create({
    userId: uid(req),
    // Persist the human-readable name for admin/driver display + the id for fares.
    type: vt?.name || b.type,
    vehicleTypeId: vt?._id,
    emergency,
    pickup: b.pickup || {},
    drop: b.drop,
    distanceKm,
    amount,
    fareBreakdown,
    grossAmount,
    discountAmount,
    promoCodeId,
    promoCode,
    etaMinutes,
    patientName: recipientName,
    notes: b.notes,
    contactId: b.contactId || undefined,
    // "Book for someone else" can target a saved contact OR a family member.
    familyMemberId: b.familyMemberId || undefined,
    recipientName,
    recipientPhone: b.recipientPhone || undefined,
    status: "SEARCHING",
    statusHistory: [{ status: "SEARCHING", at: new Date(), by: "patient", note: "Request placed" }],
  });
  // Record the promo redemption now that we have a request id to bind it to
  // (per-user limit + global usage counter). Best-effort: a failure here must
  // not fail an already-created booking.
  if (promoCodeId && appliedPromo) {
    PromoService.applyPromoToAmbulance(
      promoCodeId,
      new Types.ObjectId(uid(req)),
      r._id,
      discountAmount,
    ).catch((e) => console.error("[promo] ambulance redemption failed:", e));
  }

  // Real-time: light up the admin dispatch dashboard the instant a request
  // (or SOS) comes in — no waiting for the 15s poll.
  emitToAdmin(emergency ? "sos:new" : "ambulance-request:new", {
    requestId: String(r._id),
    emergency,
    type: r.type || "Ambulance",
    patientName: r.patientName || null,
    recipientPhone: r.recipientPhone || null,
    pickup: r.pickup || null,
    createdAt: r.createdAt,
  });
  return r;
};

router.post("/ambulance/book", verifyUserToken, async (req, res) => {
  const r = await createAmbulanceRequest(req, false);
  ok(res, toApp(r.toObject()));
});

router.post("/ambulance/emergency", verifyUserToken, async (req, res) => {
  const r = await createAmbulanceRequest(req, true);
  ok(res, toApp(r.toObject()));
});

router.get("/ambulance/active", verifyUserToken, async (req, res) => {
  const r = await AmbulanceRequest.findOne({
    userId: uid(req),
    $or: [
      { status: { $in: ACTIVE_STATUSES } },
      // Keep a just-finished trip visible for a short grace period until it's
      // paid, so the patient lands on a "Trip completed" + final-bill view
      // instead of the tracking screen snapping back to "finding ambulance".
      // Bounded to 2h so a cash-paid trip (never explicitly marked PAID)
      // doesn't stay "active" forever and keep resurfacing on every app open —
      // the app also remembers a dismissed ride once the patient taps "Done",
      // but this bound covers reinstalls/other devices too.
      {
        status: "COMPLETED",
        paymentStatus: { $ne: "PAID" },
        completedAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
    ],
  } as any)
    .sort({ createdAt: -1 })
    .lean();
  ok(res, r ? toApp(r) : null);
});

// Full booking history for "My Bookings" — every ambulance request the user
// made (any status). MUST be declared before "/ambulance/:id" so "history"
// isn't captured as an id.
// Map a patient SOS (the SOSSubmission, enriched with its EmergencyDispatch when
// the admin has dispatched an ambulance) into the same booking shape the app
// renders — so SOS journeys also show up under "My Bookings".
const sosToApp = (sub: any, disp: any) => {
  const rawStatus = String(disp?.status || sub?.status || "PENDING").toUpperCase();
  const status =
    ["COMPLETED", "RESOLVED", "CLOSED"].includes(rawStatus)
      ? "completed"
      : ["CANCELLED", "CANCELED", "FALSE_ALARM", "REJECTED"].includes(rawStatus)
        ? "cancelled"
        : "active";
  const dr = disp?.driverStaffId;
  const amb = disp?.ambulanceId;
  return {
    _id: disp?._id || sub._id,
    type: "SOS Emergency",
    status,
    emergency: true,
    pickup: disp?.pickupAddress || sub?.address
      ? { address: disp?.pickupAddress || sub?.address }
      : null,
    drop: null,
    patientName: sub?.name || disp?.patientName || null,
    notes: sub?.description || null,
    driver: dr ? { name: dr.fullName, phone: dr.mobileNumber } : null,
    vehicle: amb ? { number: amb.registrationNumber } : null,
    otp: disp?.otp || null,
    // Real final fare once the trip completed (see transitionDispatch in
    // ambulance-dispatch.service.ts); null for still-active/cancelled SOS
    // journeys — previously always null here, even for completed trips.
    amount: disp?.actualFareAmount ?? null,
    fareBreakdown: disp?.actualFareBreakdown ?? null,
    tripDistanceKm: disp?.actualDistanceKm ?? null,
    createdAt: disp?.createdAt || sub?.createdAt,
  };
};

router.get("/ambulance/history", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const list = await AmbulanceRequest.find(ownOrFamilyFilter(req, famIds))
    .sort({ createdAt: -1 })
    .lean();

  // Also include this patient's SOS journeys. SOS is a separate flow (it creates
  // a SOSSubmission, not an AmbulanceRequest), so without this it never showed
  // in My Bookings. We key each dispatch by its SOSSubmission to avoid showing a
  // SOS twice (submission + dispatch).
  const [subs, disps] = await Promise.all([
    SOSSubmission.find({ userId: uid(req) }).sort({ createdAt: -1 }).lean(),
    EmergencyDispatch.find({ patientUserId: uid(req) })
      .populate("driverStaffId", "fullName mobileNumber")
      .populate("ambulanceId", "registrationNumber")
      .lean(),
  ]);
  const dispBySos = new Map(disps.map((d: any) => [String(d.sosSubmission), d]));
  const sosItems = subs.map((s: any) => sosToApp(s, dispBySos.get(String(s._id))));

  const items = [...list.map(toApp), ...sosItems].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
  ok(res, { items });
});

// Active SOS dispatch (admin-dispatched EmergencyDispatch) for live tracking.
router.get("/sos/active", verifyUserToken, async (req, res) => {
  const d: any = await EmergencyDispatch.findOne({
    patientUserId: uid(req),
    status: { $in: ["DISPATCHED", "ACKNOWLEDGED", "EN_ROUTE", "ON_SCENE", "ON_TRIP"] },
  } as any)
    .sort({ createdAt: -1 })
    .populate("ambulanceId", "registrationNumber currentLocation")
    .populate("driverStaffId", "fullName mobileNumber")
    .lean();
  if (!d) {
    // No ambulance dispatched yet — but the patient may have just raised an SOS
    // that the control centre hasn't dispatched. Surface that PENDING SOS as a
    // "searching" ride so the tracking screen shows "finding an ambulance"
    // instead of "No active request" (which looked wrong right after an SOS).
    const sub: any = await SOSSubmission.findOne({
      userId: uid(req),
      status: { $in: ["PENDING", "IN_PROGRESS"] },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!sub) return ok(res, null);
    const sc = sub.location?.coordinates;
    return ok(res, {
      _id: sub._id,
      kind: "sos",
      status: "searching",
      otp: null,
      driver: null,
      vehicle: null,
      pickup: sc && (sc[0] || sc[1]) ? { lat: sc[1], lng: sc[0] } : null,
      driverLocation: null,
      distanceKm: null,
      etaMinutes: null,
      amount: null,
      fareBreakdown: null,
    });
  }

  const amb = d.ambulanceId;
  const ac = amb?.currentLocation?.coordinates;
  const driverLocation =
    d.driverLocation?.lat != null
      ? { lat: d.driverLocation.lat, lng: d.driverLocation.lng }
      : ac
        ? { lat: ac[1], lng: ac[0] }
        : null;
  const pc = d.patientLocation?.coordinates;
  const pickup = pc ? { lat: pc[1], lng: pc[0] } : null;
  const distanceKm = haversineKm(pickup, driverLocation);

  // Real fare, priced off the assigned ambulance's actual VehicleType
  // (resolved at dispatch time — see resolveVehicleTypeForAmbulance in
  // ambulance-dispatch.service.ts) instead of a flat placeholder. Uses the
  // real distance driven so far (actualDistanceKm, accumulated live from GPS
  // pings) once tracking has started, falling back to the road-distance
  // estimate captured at dispatch. Once the trip completes, this same shape
  // is filled from actualFareAmount/actualFareBreakdown (see below) — this
  // block only runs for in-progress trips, so it's always the live estimate.
  let amount: number | null = null;
  let fareBreakdown: Record<string, any> | null = null;
  if (d.vehicleTypeId) {
    const tripKm = Math.max(d.actualDistanceKm || d.roadDistanceKm || 0, 1);
    try {
      const breakdown = await calculateFare({
        vehicleTypeId: d.vehicleTypeId,
        distanceKm: tripKm,
        durationMin: etaMinutesFromKm(tripKm) ?? 0,
        serviceType: "WITHIN_CITY",
      });
      amount = breakdown.finalFare;
      fareBreakdown = { ...breakdown, estimated: true };
    } catch {
      // Fare config missing for this vehicle type — leave amount/fareBreakdown
      // null rather than showing a fabricated number.
    }
  }

  ok(res, {
    _id: d._id,
    kind: "sos",
    status: String(d.status || "DISPATCHED").toLowerCase(),
    otp: d.otp || null,
    driver: d.driverStaffId
      ? { name: d.driverStaffId.fullName, phone: d.driverStaffId.mobileNumber }
      : null,
    vehicle: amb?.registrationNumber ? { number: amb.registrationNumber } : null,
    pickup,
    driverLocation,
    distanceKm,
    etaMinutes: etaMinutesFromKm(distanceKm) ?? d.etaMinutes ?? null,
    amount,
    fareBreakdown,
  });
});

router.get("/ambulance/:id", verifyUserToken, async (req, res) => {
  const famIds = await familyMemberIdsFor(req);
  const r = await AmbulanceRequest.findOne({ _id: (req.params.id as string), ...ownOrFamilyFilter(req, famIds) }).lean();
  if (!r) return res.status(404).json({ success: false, message: "Request not found" });
  ok(res, toApp(r));
});

// Rate a completed ride (1–5 + optional review).
router.post("/ambulance/:id/rate", verifyUserToken, async (req, res) => {
  const rating = Number(req.body?.rating);
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: "rating must be 1–5" });
  }
  const r: any = await AmbulanceRequest.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!r) return res.status(404).json({ success: false, message: "Request not found" });
  if (r.status !== "COMPLETED") {
    return res.status(400).json({ success: false, message: "You can rate only after the trip is completed" });
  }
  r.rating = rating;
  r.review = String(req.body?.review || "").trim() || undefined;
  r.ratedAt = new Date();
  await r.save();
  ok(res, toApp(r.toObject()));
});

// Pay the ambulance bill (ambulance fare + in-transit medical expenses).
// NOTE: the payment gateway is still mock platform-wide, so this records the
// payment as collected without a real charge. Real Razorpay/PSP is a separate
// P0. The patient may also pay the crew Cash/UPI, in which case the control
// room marks it paid from the admin side instead.
router.post("/ambulance/:id/pay", verifyUserToken, async (req, res) => {
  const r: any = await AmbulanceRequest.findOne({ _id: req.params.id as string, userId: uid(req) });
  if (!r) return res.status(404).json({ success: false, message: "Request not found" });
  if (r.paymentStatus !== "PAID") {
    r.paymentStatus = "PAID";
    r.paymentMethod = String(req.body?.method || "ONLINE");
    r.paidAt = new Date();
    await r.save();
    emitToUser(String(r.userId), "booking:status", {
      requestId: String(r._id),
      status: r.status,
      paymentStatus: "PAID",
    });
  }
  ok(res, toApp(r.toObject()));
});

router.post("/ambulance/:id/cancel", verifyUserToken, async (req, res) => {
  const reqDoc: any = await AmbulanceRequest.findOne({
    _id: req.params.id as string,
    userId: uid(req),
  });
  if (!reqDoc) return res.status(404).json({ success: false, message: "Request not found" });
  if (reqDoc.status === "COMPLETED" || reqDoc.status === "CANCELLED") {
    return ok(res, toApp(reqDoc.toObject()));
  }

  // Charge applies only once an ambulance has been assigned (free while
  // Searching). Fee comes from the chosen VehicleType, else the global default.
  const charge = await cancellationFeeFor(reqDoc);
  const reason = req.body?.reason || "Cancelled by patient";

  reqDoc.status = "CANCELLED";
  reqDoc.cancelledBy = "patient";
  reqDoc.cancelReason = reason;
  reqDoc.cancelledAt = new Date();
  reqDoc.cancellationCharge = charge;
  reqDoc.statusHistory = [
    ...(reqDoc.statusHistory || []),
    {
      status: "CANCELLED",
      at: new Date(),
      by: "patient",
      note: charge > 0 ? `Cancelled by patient · charge ₹${charge}` : "Cancelled by patient",
    },
  ];
  await reqDoc.save();

  // Free the reserved ambulance + tell the crew app to drop the dispatch.
  if (reqDoc.ambulanceId) {
    await Ambulance.updateOne(
      { _id: reqDoc.ambulanceId },
      { status: "available", currentDispatchId: null },
    );
  }
  if (reqDoc.driverStaffId) {
    emitToUser(String(reqDoc.driverStaffId), "dispatch:cancelled", {
      requestId: String(reqDoc._id),
    });
  }
  emitToAdmin("ambulance-request:cancelled", {
    requestId: String(reqDoc._id),
    cancelledBy: "patient",
    cancellationCharge: charge,
  });

  ok(res, toApp(reqDoc.toObject()));
});

// ================== Geography (patient-app naming) ==================
// App expects bare `state_list`, `district_list`, `city_list`, `pincode_list`.
// Forward to the existing /location routes via lightweight stubs here.
router.get("/state_list", (_req, res) => emptyList(res));
router.get("/district_list", (_req, res) => emptyList(res));
router.get("/city_list", (_req, res) => emptyList(res));
router.get("/pincode_list", (_req, res) => emptyList(res));

export default router;
