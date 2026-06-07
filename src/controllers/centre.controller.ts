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
