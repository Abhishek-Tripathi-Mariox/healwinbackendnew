import { Request, Response } from "express";
import { Service } from "../../models/service.model";
import { invalidateCache } from "../../middlewares/cache.middleware";
import { uploadFileToAws } from "../../utils/s3";
import { paginate } from "../../utils/paginate.util";

// Slugify helper
const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const getAllServices = async (req: Request, res: Response) => {
  const { status, q } = req.query as { status?: string; q?: string };
  const filter: Record<string, any> = {};

  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;

  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { subtitle: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(
    Service,
    filter,
    req,
    { sortOrder: 1, createdAt: -1 },
    [{ path: "category", select: "name slug icon ctaOptions" }],
  );
  res.locals.data = result;
};

export const getServiceById = async (req: Request, res: Response) => {
  const service = await Service.findById(req.params.id).populate(
    "category",
    "name slug icon ctaOptions",
  );
  if (!service) {
    return res
      .status(404)
      .json({ success: false, message: "Service not found" });
  }
  res.locals.data = service;
};

export const createService = async (req: Request, res: Response) => {
  const {
    title,
    subtitle,
    description,
    icon,
    gradient,
    lightGradient,
    features,
    stats,
    ctaText,
    ctaAction,
    ctaLink,
    category,
    location,
    isPriority,
    sortOrder,
    isActive,
  } = req.body;

  if (!title || !subtitle || !description) {
    return res.status(400).json({
      success: false,
      message: "Title, subtitle, and description are required",
    });
  }

  let imageUrl: string | undefined;
  const imageFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (imageFile) {
    const uploadResult = await uploadFileToAws([imageFile]);
    imageUrl = uploadResult.images as string;
  }

  // Generate slug from title
  let slug = slugify(title);
  const existing = await Service.findOne({ slug });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  // Parse features and stats (sent as JSON strings from FormData)
  let parsedFeatures = [];
  try {
    parsedFeatures =
      typeof features === "string" ? JSON.parse(features) : features || [];
  } catch {
    parsedFeatures = [];
  }
  parsedFeatures = parsedFeatures.filter(
    (f: any) => f && f.text && f.text.trim(),
  );

  let parsedStats = [];
  try {
    parsedStats = typeof stats === "string" ? JSON.parse(stats) : stats || [];
  } catch {
    parsedStats = [];
  }
  parsedStats = parsedStats.filter((s: any) => s && s.value && s.value.trim());

  // Parse location if provided
  let parsedLocation = undefined;
  try {
    const loc = typeof location === "string" ? JSON.parse(location) : location;
    if (loc && loc.coordinates && loc.coordinates.length === 2) {
      parsedLocation = {
        type: "Point" as const,
        coordinates: [Number(loc.coordinates[0]), Number(loc.coordinates[1])],
        address: loc.address || "",
      };
    }
  } catch {
    // ignore invalid location
  }

  const service = await Service.create({
    title,
    subtitle,
    slug,
    description,
    category: category || undefined,
    image: imageUrl || req.body.image || "",
    icon: icon || "Heart",
    gradient: gradient || "from-hw-primary to-hw-primary-dark",
    lightGradient: lightGradient || "from-blue-50 to-indigo-50",
    features: parsedFeatures,
    stats: parsedStats,
    ctaText: ctaText || "Learn More",
    ctaAction: ctaAction || "info",
    ctaLink,
    location: parsedLocation,
    isPriority:
      isPriority !== undefined
        ? isPriority === "true" || isPriority === true
        : false,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
  });

  await invalidateCache("/v1/api/services");
  res.locals.data = service;
};

export const updateService = async (req: Request, res: Response) => {
  const {
    title,
    subtitle,
    description,
    icon,
    gradient,
    lightGradient,
    features,
    stats,
    ctaText,
    ctaAction,
    ctaLink,
    category,
    location,
    isPriority,
    sortOrder,
    isActive,
  } = req.body;

  const update: Record<string, any> = {};
  if (title !== undefined) update.title = title;
  if (subtitle !== undefined) update.subtitle = subtitle;
  if (description !== undefined) update.description = description;
  if (icon !== undefined) update.icon = icon;
  if (gradient !== undefined) update.gradient = gradient;
  if (lightGradient !== undefined) update.lightGradient = lightGradient;
  if (ctaText !== undefined) update.ctaText = ctaText;
  if (ctaAction !== undefined) update.ctaAction = ctaAction;
  if (ctaLink !== undefined) update.ctaLink = ctaLink;
  if (category !== undefined) update.category = category || null;

  if (features !== undefined) {
    try {
      let parsed =
        typeof features === "string" ? JSON.parse(features) : features;
      update.features = (parsed || []).filter(
        (f: any) => f && f.text && f.text.trim(),
      );
    } catch {
      update.features = [];
    }
  }

  if (stats !== undefined) {
    try {
      let parsed = typeof stats === "string" ? JSON.parse(stats) : stats;
      update.stats = (parsed || []).filter(
        (s: any) => s && s.value && s.value.trim(),
      );
    } catch {
      update.stats = [];
    }
  }

  if (isPriority !== undefined)
    update.isPriority = isPriority === "true" || isPriority === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;

  // Handle location
  if (location !== undefined) {
    try {
      const loc =
        typeof location === "string" ? JSON.parse(location) : location;
      if (loc && loc.coordinates && loc.coordinates.length === 2) {
        update.location = {
          type: "Point",
          coordinates: [Number(loc.coordinates[0]), Number(loc.coordinates[1])],
          address: loc.address || "",
        };
      } else {
        update.location = null;
      }
    } catch {
      update.location = null;
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

  // Update slug if title changed
  if (title) {
    let slug = slugify(title);
    const existing = await Service.findOne({
      slug,
      _id: { $ne: req.params.id },
    });
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }
    update.slug = slug;
  }

  const service = await Service.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!service) {
    return res
      .status(404)
      .json({ success: false, message: "Service not found" });
  }

  await invalidateCache("/v1/api/services");
  res.locals.data = service;
};

export const deleteService = async (req: Request, res: Response) => {
  const service = await Service.findByIdAndDelete(req.params.id);
  if (!service) {
    return res
      .status(404)
      .json({ success: false, message: "Service not found" });
  }
  res.locals.data = { message: "Service deleted" };
  await invalidateCache("/v1/api/services");
};
