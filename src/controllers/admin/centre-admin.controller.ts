import { Request, Response } from "express";
import { Centre } from "../../models/centre.model";
import { uploadFileToAws } from "../../utils/s3";
import { paginate } from "../../utils/paginate.util";
import { invalidateCache } from "../../middlewares/cache.middleware";

export const getAllCentres = async (req: Request, res: Response) => {
  const { status, q, state, district, type, serviceType } = req.query as {
    status?: string;
    q?: string;
    state?: string;
    district?: string;
    type?: string;
    serviceType?: string;
  };
  const filter: Record<string, any> = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
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
  const result = await paginate(Centre, filter, req, { createdAt: -1 }, [
    { path: "state", select: "name code" },
    { path: "district", select: "name" },
    { path: "division", select: "name" },
    { path: "serviceTypes", select: "name slug icon" },
    { path: "departments", select: "name" },
  ]);
  res.locals.data = result;
};

export const getCentreById = async (req: Request, res: Response) => {
  const centre = await Centre.findById(req.params.id)
    .populate("state", "name code")
    .populate("district", "name")
    .populate("division", "name")
    .populate("serviceTypes", "name slug icon")
    .populate("departments", "name");
  if (!centre)
    return res
      .status(404)
      .json({ success: false, message: "Centre not found" });
  res.locals.data = centre;
};

export const createCentre = async (req: Request, res: Response) => {
  const {
    name,
    type,
    address,
    state,
    district,
    division,
    location,
    phone,
    email,
    website,
    serviceTypes,
    departments,
    services,
    rating,
    timings,
    info,
    isActive,
  } = req.body;

  if (!name || !type || !address || !state || !district) {
    return res.status(400).json({
      success: false,
      message: "Name, type, address, state and district are required",
    });
  }

  let imageUrl = "";
  const imageFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (imageFile) {
    const uploadResult = await uploadFileToAws([imageFile]);
    imageUrl = uploadResult.images as string;
  }

  // Parse location
  let parsedLocation = {
    type: "Point" as const,
    coordinates: [0, 0] as [number, number],
  };
  try {
    const loc = typeof location === "string" ? JSON.parse(location) : location;
    if (loc && loc.coordinates && loc.coordinates.length === 2) {
      parsedLocation = {
        type: "Point",
        coordinates: [Number(loc.coordinates[0]), Number(loc.coordinates[1])],
      };
    }
  } catch {}

  // Parse arrays
  let parsedServiceTypes: string[] = [];
  try {
    parsedServiceTypes =
      typeof serviceTypes === "string"
        ? JSON.parse(serviceTypes)
        : serviceTypes || [];
  } catch {
    parsedServiceTypes = [];
  }

  let parsedDepartments: string[] = [];
  try {
    parsedDepartments =
      typeof departments === "string"
        ? JSON.parse(departments)
        : departments || [];
  } catch {
    parsedDepartments = [];
  }

  let parsedServices: string[] = [];
  try {
    parsedServices =
      typeof services === "string" ? JSON.parse(services) : services || [];
  } catch {
    parsedServices = [];
  }

  const centre = new Centre({
    name,
    type,
    address,
    state,
    district,
    division: division || undefined,
    location: parsedLocation,
    phone: phone || "",
    email: email || "",
    website: website || "",
    serviceTypes: parsedServiceTypes,
    departments: parsedDepartments,
    services: parsedServices.filter((s: string) => s && s.trim()),
    rating: rating ? Number(rating) : 0,
    timings: timings || "",
    image: imageUrl || req.body.image || "",
    info: info || "",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
  });
  await centre.save();

  const populated = await centre.populate([
    { path: "state", select: "name code" },
    { path: "district", select: "name" },
    { path: "division", select: "name" },
    { path: "serviceTypes", select: "name slug icon" },
    { path: "departments", select: "name" },
  ]);
  await invalidateCache("/v1/api/centres");
  res.locals.data = populated;
};

export const updateCentre = async (req: Request, res: Response) => {
  const {
    name,
    type,
    address,
    state,
    district,
    division,
    location,
    phone,
    email,
    website,
    serviceTypes,
    departments,
    services,
    rating,
    timings,
    info,
    isActive,
  } = req.body;

  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = type;
  if (address !== undefined) update.address = address;
  if (state !== undefined) update.state = state;
  if (district !== undefined) update.district = district;
  if (division !== undefined) update.division = division || undefined;
  if (phone !== undefined) update.phone = phone;
  if (email !== undefined) update.email = email;
  if (website !== undefined) update.website = website;
  if (rating !== undefined) update.rating = Number(rating);
  if (timings !== undefined) update.timings = timings;
  if (info !== undefined) update.info = info;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;

  if (location !== undefined) {
    try {
      const loc =
        typeof location === "string" ? JSON.parse(location) : location;
      if (loc && loc.coordinates && loc.coordinates.length === 2) {
        update.location = {
          type: "Point",
          coordinates: [Number(loc.coordinates[0]), Number(loc.coordinates[1])],
        };
      }
    } catch {}
  }

  if (serviceTypes !== undefined) {
    try {
      update.serviceTypes =
        typeof serviceTypes === "string"
          ? JSON.parse(serviceTypes)
          : serviceTypes || [];
    } catch {
      update.serviceTypes = [];
    }
  }
  if (departments !== undefined) {
    try {
      update.departments =
        typeof departments === "string"
          ? JSON.parse(departments)
          : departments || [];
    } catch {
      update.departments = [];
    }
  }
  if (services !== undefined) {
    try {
      const parsed =
        typeof services === "string" ? JSON.parse(services) : services || [];
      update.services = parsed.filter((s: string) => s && s.trim());
    } catch {
      update.services = [];
    }
  }

  // Handle image upload
  const imageFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (imageFile) {
    const uploadResult = await uploadFileToAws([imageFile]);
    update.image = uploadResult.images as string;
  } else if (req.body.image !== undefined) {
    update.image = req.body.image;
  }

  const centre = await Centre.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  })
    .populate("state", "name code")
    .populate("district", "name")
    .populate("division", "name")
    .populate("serviceTypes", "name slug icon")
    .populate("departments", "name");
  if (!centre)
    return res
      .status(404)
      .json({ success: false, message: "Centre not found" });
  await invalidateCache("/v1/api/centres");
  res.locals.data = centre;
};

export const deleteCentre = async (req: Request, res: Response) => {
  const centre = await Centre.findByIdAndDelete(req.params.id);
  if (!centre)
    return res
      .status(404)
      .json({ success: false, message: "Centre not found" });
  res.locals.data = { message: "Centre deleted" };
  await invalidateCache("/v1/api/centres");
};
