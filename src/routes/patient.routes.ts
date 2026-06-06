import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import AuthMiddleware from "../middlewares/auth.middleware";
import Pharmacy from "../models/pharmacy.model";
import PatientFamilyMember from "../models/patient-family-member.model";
import PatientMedicalRecord from "../models/patient-medical-record.model";
import { Admin } from "../models/admin.model";
import LabTest from "../models/lab-test.model";
import PharmacyProduct from "../models/pharmacy-product.model";
import AmbulanceRequest from "../models/ambulance-request.model";
import { haversineKm, etaMinutesFromKm } from "../utils/geo.util";
import { emitToAdmin } from "../utils/socket.util";

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

router.post("/family-members", verifyUserToken, async (req, res) => {
  const b = req.body ?? {};
  const member = await PatientFamilyMember.create({
    userId: uid(req),
    name: b.name,
    relation: b.relation,
    phone: b.phone,
    age: b.age != null ? String(b.age) : undefined,
    gender: b.gender,
    bloodGroup: b.bloodGroup,
    conditions: b.conditions,
  });
  ok(res, member);
});

router.put("/family-members/:id", verifyUserToken, async (req, res) => {
  const b = req.body ?? {};
  const updated = await PatientFamilyMember.findOneAndUpdate(
    { _id: req.params.id, userId: uid(req) },
    { $set: { name: b.name, relation: b.relation, phone: b.phone, age: b.age != null ? String(b.age) : undefined, gender: b.gender, bloodGroup: b.bloodGroup, conditions: b.conditions } },
    { new: true },
  );
  if (!updated) return res.status(404).json({ success: false, message: "Member not found" });
  ok(res, updated);
});

router.delete("/family-members/:id", verifyUserToken, async (req, res) => {
  await PatientFamilyMember.deleteOne({ _id: req.params.id, userId: uid(req) });
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
  const a = await Admin.findOne({ _id: req.params.id, roleName: "Doctor", isDeleted: false }).lean();
  if (!a) return res.status(404).json({ success: false, message: "Doctor not found" });
  ok(res, toAppDoctor(a));
});
router.get("/doctors/:id/slots", (_req, res) => emptyList(res));
router.post("/consultations", verifyUserToken, (req, res) =>
  ok(res, { _id: "stub", ...req.body })
);
router.get("/consultations/:id", verifyUserToken, (req, res) =>
  res.status(404).json({ success: false, message: "Consultation not found" })
);

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
  const p = await PharmacyProduct.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!p) return res.status(404).json({ success: false, message: "Product not found" });
  ok(res, p);
});
router.get("/pharmacy/cart", verifyUserToken, (_req, res) =>
  ok(res, { items: [], total: 0 })
);
router.post("/pharmacy/cart", verifyUserToken, (req, res) => ok(res, req.body));
router.post("/pharmacy/orders", verifyUserToken, (req, res) =>
  ok(res, { _id: "stub", ...req.body })
);
router.get("/pharmacy/orders", verifyUserToken, (_req, res) => emptyList(res));
router.get("/pharmacy/orders/:id", verifyUserToken, (req, res) =>
  res.status(404).json({ success: false, message: "Order not found" })
);

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
  const t = await LabTest.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!t) return res.status(404).json({ success: false, message: "Test not found" });
  ok(res, t);
});
router.post("/lab/bookings", verifyUserToken, (req, res) =>
  ok(res, { _id: "stub", ...req.body })
);
router.get("/lab/bookings", verifyUserToken, (_req, res) => emptyList(res));
router.get("/lab/bookings/:id", verifyUserToken, (req, res) =>
  res.status(404).json({ success: false, message: "Lab booking not found" })
);

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
  const r = await PatientMedicalRecord.findOne({ _id: req.params.id, userId: uid(req) }).lean();
  if (!r) {
    return res.status(404).json({ success: false, message: "Record not found" });
  }
  ok(res, { ...r, uploadedAt: r.createdAt });
});

router.delete("/medical-records/:id", verifyUserToken, async (req, res) => {
  await PatientMedicalRecord.deleteOne({ _id: req.params.id, userId: uid(req) });
  ok(res);
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

// ================== Ambulance (alias over bookings) ==================
router.get("/ambulance/types", (_req, res) =>
  res.json({
    success: true,
    data: [
      { _id: "basic", name: "Basic Life Support", priceFrom: 800 },
      { _id: "als", name: "Advanced Life Support", priceFrom: 1500 },
      { _id: "icu", name: "ICU on wheels", priceFrom: 2500 },
    ],
  })
);
router.post("/ambulance/estimate", verifyUserToken, (req, res) =>
  ok(res, { amount: 1200, currency: "INR", ...req.body })
);

// Real, persisted ambulance requests. The admin dispatch screen assigns an
// ambulance + driver; on assignment the user is pushed (FCM) + socket-notified
// and the app flips to live tracking. `toApp` shapes the record for the app.
const ACTIVE_STATUSES = ["SEARCHING", "ASSIGNED", "ARRIVED", "ON_TRIP"];

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
    driver: r.driverName ? { name: r.driverName, phone: r.driverPhone } : null,
    vehicle: r.vehicleNumber ? { number: r.vehicleNumber } : null,
    otp: r.otp || null,
    // Prefer the live, distance-derived ETA once we have the ambulance's
    // position; otherwise fall back to the admin's assignment estimate.
    etaMinutes: liveEta ?? r.etaMinutes ?? null,
    driverLocation: r.driverLocation || null,
    distanceKm,
    lastLocationAt: r.lastLocationAt || null,
    createdAt: r.createdAt,
  };
};

const createAmbulanceRequest = async (req: Request, emergency: boolean) => {
  const b: any = req.body ?? {};
  const r = await AmbulanceRequest.create({
    userId: uid(req),
    type: b.type,
    emergency,
    pickup: b.pickup || {},
    drop: b.drop,
    patientName: b.patientName,
    notes: b.notes,
    status: "SEARCHING",
  });
  // Real-time: light up the admin dispatch dashboard the instant a request
  // (or SOS) comes in — no waiting for the 15s poll.
  emitToAdmin(emergency ? "sos:new" : "ambulance-request:new", {
    requestId: String(r._id),
    emergency,
    type: r.type || "Ambulance",
    patientName: r.patientName || null,
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

router.get("/ambulance/:id", verifyUserToken, async (req, res) => {
  const r = await AmbulanceRequest.findOne({ _id: req.params.id, userId: uid(req) }).lean();
  if (!r) return res.status(404).json({ success: false, message: "Request not found" });
  ok(res, toApp(r));
});

router.post("/ambulance/:id/cancel", verifyUserToken, async (req, res) => {
  const r = await AmbulanceRequest.findOneAndUpdate(
    { _id: req.params.id, userId: uid(req) },
    { $set: { status: "CANCELLED", notes: req.body?.reason } },
    { new: true },
  ).lean();
  if (!r) return res.status(404).json({ success: false, message: "Request not found" });
  ok(res, toApp(r));
});

// ================== Geography (patient-app naming) ==================
// App expects bare `state_list`, `district_list`, `city_list`, `pincode_list`.
// Forward to the existing /location routes via lightweight stubs here.
router.get("/state_list", (_req, res) => emptyList(res));
router.get("/district_list", (_req, res) => emptyList(res));
router.get("/city_list", (_req, res) => emptyList(res));
router.get("/pincode_list", (_req, res) => emptyList(res));

export default router;
