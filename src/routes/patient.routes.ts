import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import AuthMiddleware from "../middlewares/auth.middleware";
import Pharmacy from "../models/pharmacy.model";
import PatientFamilyMember from "../models/patient-family-member.model";
import SavedContact from "../models/saved-contact.model";
import PatientMedicalRecord from "../models/patient-medical-record.model";
import { Admin } from "../models/admin.model";
import LabTest from "../models/lab-test.model";
import PharmacyProduct from "../models/pharmacy-product.model";
import AmbulanceRequest from "../models/ambulance-request.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import VehicleType from "../models/vehicle-type.model";
import { PharmacyOrder, LabBooking, Consultation } from "../models/patient-commerce.model";
import HomePromo from "../models/home-promo.model";
import { MembershipPlan, UserMembership } from "../models/membership.model";
import { calculateFare } from "../services/fare.service";
import * as PromoService from "../services/promo.service";
import { reverseGeocode, searchPlaces, resolvePlace } from "../services/geocode.service";
import { haversineKm, etaMinutesFromKm } from "../utils/geo.util";
import { generateSlots, slotToDate, slotLabelFor } from "../utils/slots.util";
import { emitToAdmin, emitToUser } from "../utils/socket.util";
import Ambulance from "../models/ambulance.model";
import config from "../config";
import { Types } from "mongoose";

const router = Router();
const { verifyUserToken } = AuthMiddleware();

// Local disk storage for the records stub. Replaced by S3/GCS once the
// real medical-records pipeline lands. Files live under /uploads so they
// can be served by the static handler in server.ts and surface in the
// patient app's "Open" action.
const uploadDir = path.join(process.cwd(), "uploads", "medical-records");
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {
  /* dir already exists */
}
const recordsUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`),
  }),
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
  const booked = await Consultation.find({
    doctorId: req.params.id,
    status: { $ne: "CANCELLED" },
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
  })
    .select("scheduledAt")
    .lean();
  const bookedSet = new Set(booked.map((c: any) => new Date(c.scheduledAt).getTime()));
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
    const clash = await Consultation.findOne({
      doctorId: doc._id,
      status: { $ne: "CANCELLED" },
      scheduledAt: when,
    }).lean();
    if (clash) {
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
  const list = await Consultation.find({ userId: uid(req) }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/consultations/:id", verifyUserToken, async (req, res) => {
  const c = await Consultation.findOne({ _id: (req.params.id as string), userId: uid(req) }).lean();
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
router.get("/pharmacy/products", async (req, res) => {
  const { q, category } = req.query as { q?: string; category?: string };
  const query: any = { isActive: true, isDeleted: false };
  if (category) query.category = category;
  if (q) query.name = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const list = await PharmacyProduct.find(query).sort({ name: 1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/pharmacy/products/:id", async (req, res) => {
  const p = await PharmacyProduct.findOne({ _id: (req.params.id as string), isDeleted: false }).lean();
  if (!p) return res.status(404).json({ success: false, message: "Product not found" });
  ok(res, p);
});
router.get("/pharmacy/cart", verifyUserToken, (_req, res) =>
  ok(res, { items: [], total: 0 })
);
router.post("/pharmacy/cart", verifyUserToken, (req, res) => ok(res, req.body));

// Real, persisted pharmacy orders. Prices are read from the catalog at order
// time so the stored total can't be tampered with from the client.
router.post("/pharmacy/orders", verifyUserToken, async (req, res) => {
  const b: any = req.body ?? {};
  const reqItems: { productId: string; qty: number }[] = Array.isArray(b.items) ? b.items : [];
  if (reqItems.length === 0) {
    return res.status(400).json({ success: false, message: "items are required" });
  }
  const ids = reqItems.map((i) => i.productId).filter(Boolean);
  const products = await PharmacyProduct.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).lean();
  const byId = new Map(products.map((p: any) => [String(p._id), p]));
  const items = reqItems
    .map((i) => {
      const p: any = byId.get(String(i.productId));
      if (!p) return null;
      const qty = Math.max(1, Number(i.qty) || 1);
      return { productId: p._id, name: p.name, price: p.price ?? 0, qty };
    })
    .filter(Boolean) as any[];
  if (items.length === 0) {
    return res.status(400).json({ success: false, message: "No valid products in order" });
  }
  const totalAmount = items.reduce((s, it) => s + it.price * it.qty, 0);
  const order = await PharmacyOrder.create({
    userId: uid(req),
    items,
    addressId: b.addressId || undefined,
    prescriptionUrl: b.prescriptionUrl || undefined,
    totalAmount,
  });
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
  const list = await LabBooking.find({ userId: uid(req) }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: list, message: "ok" });
});
router.get("/lab/bookings/:id", verifyUserToken, async (req, res) => {
  const bk = await LabBooking.findOne({ _id: (req.params.id as string), userId: uid(req) }).lean();
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
  const query: any = { userId: uid(req) };
  if (familyMemberId) query.familyMemberId = familyMemberId;
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
    // Absolute URL so the patient app's launchUrl() can open it from the
    // device browser. req.protocol respects trust-proxy from server.ts.
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fileUrl = file
      ? `${baseUrl}/uploads/medical-records/${path.basename(file.path)}`
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
  const r = await PatientMedicalRecord.findOne({ _id: (req.params.id as string), userId: uid(req) }).lean();
  if (!r) {
    return res.status(404).json({ success: false, message: "Record not found" });
  }
  ok(res, { ...r, uploadedAt: r.createdAt });
});

router.delete("/medical-records/:id", verifyUserToken, async (req, res) => {
  await PatientMedicalRecord.deleteOne({ _id: (req.params.id as string), userId: uid(req) });
  ok(res);
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
router.get("/facilities/hospitals", (_req, res) => emptyList(res));
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
router.get("/facilities/labs", (_req, res) => emptyList(res));

// ================== Home feed ==================
router.get("/home/feed", (_req, res) =>
  ok(res, {
    banners: [],
    shortcuts: [],
    upcoming: [],
    suggestions: [],
  })
);
router.get("/home/banners", (_req, res) => emptyList(res));

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
    tripDistanceKm: r.distanceKm ?? null,
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
    status: { $in: ACTIVE_STATUSES },
  } as any)
    .sort({ createdAt: -1 })
    .lean();
  ok(res, r ? toApp(r) : null);
});

// Full booking history for "My Bookings" — every ambulance request the user
// made (any status). MUST be declared before "/ambulance/:id" so "history"
// isn't captured as an id.
router.get("/ambulance/history", verifyUserToken, async (req, res) => {
  const list = await AmbulanceRequest.find({ userId: uid(req) })
    .sort({ createdAt: -1 })
    .lean();
  ok(res, { items: list.map(toApp) });
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
  if (!d) return ok(res, null);

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

  // DUMMY SOS FARE (placeholder until the real SOS fare engine is wired). An
  // emergency dispatch has no booked VehicleType, so we estimate a stable fare
  // from a flat base + a nominal trip distance + GST, and surface it as
  // amount + fareBreakdown so the patient sees a price breakup on the tracking
  // screen. tripKm is fixed per-dispatch (not the shrinking approach distance)
  // so the amount doesn't fluctuate as the ambulance nears.
  const SOS_BASE_FARE = 500;
  const SOS_PER_KM = 20;
  const SOS_GST_PCT = 5;
  const tripKm = Math.max(Math.round(d.estimatedDistanceKm || 10), 1);
  const distanceCharge = tripKm * SOS_PER_KM;
  const subtotal = SOS_BASE_FARE + distanceCharge;
  const gstAmount = Math.round((subtotal * SOS_GST_PCT) / 100);
  const finalFare = subtotal + gstAmount;
  const fareBreakdown = {
    baseFare: SOS_BASE_FARE,
    distanceCharge,
    distanceKm: tripKm,
    gstPercentage: SOS_GST_PCT,
    gstAmount,
    finalFare,
    estimated: true,
  };

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
    // Dummy payment so the patient sees an estimated fare for the SOS trip.
    amount: finalFare,
    fareBreakdown,
  });
});

router.get("/ambulance/:id", verifyUserToken, async (req, res) => {
  const r = await AmbulanceRequest.findOne({ _id: (req.params.id as string), userId: uid(req) }).lean();
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
