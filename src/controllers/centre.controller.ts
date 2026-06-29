import { Request, Response } from "express";
import { Centre } from "../models/centre.model";
import { LocatorServiceType } from "../models/locator-service-type.model";
import { Department } from "../models/department.model";

// List all active locator service types (for tabs on centre locator page)
export const listServiceTypes = async (_req: Request, res: Response) => {
  const types = await LocatorServiceType.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = types;
};

// List all active departments
export const listDepartments = async (_req: Request, res: Response) => {
  const departments = await Department.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = departments;
};

// Relevant centre service tags per emergency/case type.
const CASE_TAGS: Record<string, string[]> = {
  MEDICAL: ["emergency", "icu", "opd", "general"],
  ACCIDENT: ["emergency", "trauma", "icu", "surgery", "orthopedic"],
  TRAUMA: ["emergency", "trauma", "icu", "surgery"],
  CARDIAC: ["cardiac", "cardiology", "icu", "emergency"],
  STROKE: ["neuro", "neurology", "icu", "emergency"],
  BURN: ["burn", "emergency", "icu"],
  FIRE: ["burn", "emergency", "icu"],
  PEDIATRIC: ["pediatric", "nicu", "emergency"],
  MATERNITY: ["maternity", "obstetric", "gynec", "nicu"],
  POISON: ["emergency", "icu"],
};

/**
 * GET /centres/suggest?lat=&lng=&caseType= — best hospital(s) for a case: nearest
 * first, but boosted when a centre's services match the case type (e.g. a
 * cardiac case prefers a cardiac-capable hospital). Used by the call centre and
 * the crew's hospital-select screen.
 */
export const suggestHospitals = async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const caseType = String(req.query.caseType || "").toUpperCase();
  const wantTags = CASE_TAGS[caseType] || [];

  const baseFilter = { isVerified: true, isDeleted: { $ne: true } } as any;
  let centres: any[];
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    centres = await Centre.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          spherical: true,
          query: baseFilter,
        },
      },
      { $limit: 30 },
    ]);
  } else {
    centres = await Centre.find(baseFilter).limit(30).lean();
  }

  const scored = centres.map((c: any) => {
    const tags = (c.services || []).map((s: string) => String(s).toLowerCase());
    const matches = wantTags.filter((w) => tags.some((t: string) => t.includes(w)));
    const distanceKm = c.distanceMeters != null ? Math.round((c.distanceMeters / 1000) * 10) / 10 : null;
    return {
      _id: String(c._id),
      name: c.name,
      address: c.address,
      phone: c.phone,
      services: c.services || [],
      lat: c.location?.coordinates?.[1],
      lng: c.location?.coordinates?.[0],
      distanceKm,
      matchCount: matches.length,
      matchedFor: matches,
      recommended: false,
    };
  });

  // Rank: more case-type matches first, then nearest.
  scored.sort((a, b) => b.matchCount - a.matchCount || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  if (scored[0]) scored[0].recommended = true;

  res.locals.data = { caseType: caseType || null, items: scored.slice(0, 10) };
};

// Search centres with filters
export const searchCentres = async (req: Request, res: Response) => {
  const {
    q,
    state,
    district,
    type,
    serviceType,
    lat,
    lng,
    maxDistance = "50000",
  } = req.query as {
    q?: string;
    state?: string;
    district?: string;
    type?: string;
    serviceType?: string;
    lat?: string;
    lng?: string;
    maxDistance?: string;
  };

  const filter: Record<string, any> = { isActive: true };

  if (state) filter.state = state;
  if (district) filter.district = district;
  if (type) filter.type = type;
  if (serviceType) filter.serviceTypes = serviceType;

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { address: { $regex: q, $options: "i" } },
      { info: { $regex: q, $options: "i" } },
    ];
  }

  // Geospatial query if lat/lng provided
  if (lat && lng) {
    filter.location = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
        $maxDistance: Number(maxDistance),
      },
    };
  }

  const centres = await Centre.find(filter)
    .populate("state", "name code")
    .populate("district", "name")
    .populate("division", "name")
    .populate("serviceTypes", "name slug icon")
    .populate("departments", "name")
    .limit(50)
    .lean();
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.locals.data = centres;
};

// Get single centre
export const getCentreByIdPublic = async (req: Request, res: Response) => {
  const centre = await Centre.findOne({ _id: (req.params.id as string), isActive: true })
    .populate("state", "name code")
    .populate("district", "name")
    .populate("division", "name")
    .populate("serviceTypes", "name slug icon")
    .populate("departments", "name")
    .lean();
  if (!centre)
    return res
      .status(404)
      .json({ success: false, message: "Centre not found" });
  res.locals.data = centre;
};
