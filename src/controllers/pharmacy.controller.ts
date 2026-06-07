import { Request, Response, NextFunction } from "express";
import Pharmacy from "../models/pharmacy.model";
import { uploadFileToAws } from "../utils/s3";

/**
 * Pharmacy platform — admin management (CRUD + approve/reject) and the public
 * Pharmacy Locator (listing + geo filter + public onboarding submission).
 */

const toLngLat = (lng: any, lat: any): [number, number] | undefined => {
  const a = Number(lng);
  const b = Number(lat);
  if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  return undefined;
};

// ============================ ADMIN ============================

export const adminList = async (
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
  if (req.query.status) query.status = req.query.status;
  if (req.query.state) query.state = req.query.state;
  if (req.query.district) query.district = req.query.district;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { phone: rx }, { address: rx }];
  }

  const [items, total] = await Promise.all([
    Pharmacy.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("state", "name")
      .populate("district", "name")
      .lean(),
    Pharmacy.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "pharmacy_list";
  return next();
};

export const adminDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const pharmacy = await Pharmacy.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  })
    .populate("state", "name")
    .populate("district", "name")
    .lean();
  if (!pharmacy) {
    req.rCode = 5;
    req.msg = "pharmacy_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { pharmacy };
  req.msg = "pharmacy_detail";
  return next();
};

const buildPharmacyFromBody = (b: any) => {
  const doc: any = {
    name: b.name,
    ownerName: b.ownerName || undefined,
    licenseNumber: b.licenseNumber || undefined,
    address: b.address,
    state: b.state || undefined,
    district: b.district || undefined,
    phone: b.phone,
    email: b.email || undefined,
    is24x7: b.is24x7 === true || b.is24x7 === "true",
    timings: b.timings || undefined,
    services:
      typeof b.services === "string"
        ? b.services.split(",").map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(b.services)
          ? b.services
          : [],
  };
  const coords = toLngLat(b.lng ?? b.longitude, b.lat ?? b.latitude);
  if (coords) doc.location = { type: "Point", coordinates: coords };
  return doc;
};

export const adminCreate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.name || !b.phone || !b.address) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name, phone and address are required" };
    return next();
  }
  const doc = buildPharmacyFromBody(b);
  if (req.file) {
    const { images } = await uploadFileToAws([req.file]);
    doc.image = images;
  }
  const pharmacy = await Pharmacy.create({
    ...doc,
    status: "approved", // admin-created listings are approved by default
    source: "admin",
    createdByAdminId: adminId,
  });
  req.rData = { pharmacy };
  req.msg = "pharmacy_created";
  return next();
};

export const adminUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const pharmacy = await Pharmacy.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!pharmacy) {
    req.rCode = 5;
    req.msg = "pharmacy_not_found";
    req.rData = {};
    return next();
  }
  const doc = buildPharmacyFromBody({ ...pharmacy.toObject(), ...b });
  Object.assign(pharmacy, doc);
  if (b.isActive !== undefined)
    pharmacy.isActive = b.isActive === true || b.isActive === "true";
  if (req.file) {
    const { images } = await uploadFileToAws([req.file]);
    pharmacy.image = images as string;
  }
  await pharmacy.save();
  req.rData = { pharmacy };
  req.msg = "pharmacy_updated";
  return next();
};

export const adminApprove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const pharmacy = await Pharmacy.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!pharmacy) {
    req.rCode = 5;
    req.msg = "pharmacy_not_found";
    req.rData = {};
    return next();
  }
  const approve = String(req.body?.approve ?? "true") !== "false";
  pharmacy.status = approve ? "approved" : "rejected";
  if (!approve) pharmacy.rejectionReason = req.body?.reason || undefined;
  await pharmacy.save();
  req.rData = { pharmacy };
  req.msg = "pharmacy_updated";
  return next();
};

export const adminRemove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const pharmacy = await Pharmacy.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!pharmacy) {
    req.rCode = 5;
    req.msg = "pharmacy_not_found";
    req.rData = {};
    return next();
  }
  pharmacy.isDeleted = true;
  pharmacy.isActive = false;
  await pharmacy.save();
  req.rData = {};
  req.msg = "pharmacy_deleted";
  return next();
};

// ============================ PUBLIC ============================

/**
 * GET /pharmacies — public locator. Approved + active only. Supports
 * ?state=&district=&search= and ?lng=&lat=&radiusKm= proximity search.
 */
export const publicList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const query: any = { status: "approved", isActive: true, isDeleted: false };
  if (req.query.state) query.state = req.query.state;
  if (req.query.district) query.district = req.query.district;
  const search = ((req.query.search as string) || "").trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { address: rx }];
  }

  const coords = toLngLat(req.query.lng, req.query.lat);
  let items;
  if (coords) {
    const radiusKm = Number(req.query.radiusKm) || 10;
    query.location = {
      $near: {
        $geometry: { type: "Point", coordinates: coords },
        $maxDistance: radiusKm * 1000,
      },
    };
    items = await Pharmacy.find(query).limit(100).lean();
  } else {
    items = await Pharmacy.find(query)
      .sort({ rating: -1, createdAt: -1 })
      .limit(100)
      .lean();
  }

  req.rData = { items };
  req.msg = "pharmacy_list";
  return next();
};

/** POST /pharmacies/request — public onboarding submission (status=pending). */
export const publicSubmit = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  if (!b.name || !b.phone || !b.address) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name, phone and address are required" };
    return next();
  }
  const doc = buildPharmacyFromBody(b);
  if (req.file) {
    const { images } = await uploadFileToAws([req.file]);
    doc.image = images;
  }
  const pharmacy = await Pharmacy.create({
    ...doc,
    status: "pending",
    source: "public",
  });
  req.rData = { pharmacyId: pharmacy._id };
  req.msg = "pharmacy_submitted";
  return next();
};
