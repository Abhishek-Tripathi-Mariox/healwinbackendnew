import { Request, Response } from "express";
import { ServiceCategory } from "../../models/service-category.model";
import { paginate } from "../../utils/paginate.util";
import { invalidateCache } from "../../middlewares/cache.middleware";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const getAllCategories = async (req: Request, res: Response) => {
  const { status, q } = req.query as { status?: string; q?: string };
  const filter: Record<string, any> = {};

  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(ServiceCategory, filter, req, {
    sortOrder: 1,
    createdAt: -1,
  });
  res.locals.data = result;
};

export const getCategoryById = async (req: Request, res: Response) => {
  const category = await ServiceCategory.findById(req.params.id);
  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }
  res.locals.data = category;
};

export const createCategory = async (req: Request, res: Response) => {
  const { name, icon, description, ctaOptions, isActive, sortOrder } = req.body;

  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Category name is required" });
  }

  let slug = slugify(name);
  const existing = await ServiceCategory.findOne({ slug });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  // Parse ctaOptions if sent as JSON string
  let parsedCtaOptions = [];
  try {
    parsedCtaOptions =
      typeof ctaOptions === "string"
        ? JSON.parse(ctaOptions)
        : ctaOptions || [];
  } catch {
    parsedCtaOptions = [];
  }
  parsedCtaOptions = parsedCtaOptions.filter(
    (opt: any) => opt && opt.label && opt.label.trim(),
  );

  const category = await ServiceCategory.create({
    name,
    slug,
    icon: icon || "Heart",
    description: description || "",
    ctaOptions: parsedCtaOptions,
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });

  await invalidateCache("/v1/api/service-categories", "/v1/api/services");
  res.locals.data = category;
};

export const updateCategory = async (req: Request, res: Response) => {
  const { name, icon, description, ctaOptions, isActive, sortOrder } = req.body;

  const update: Record<string, any> = {};
  if (name !== undefined) {
    update.name = name;
    let slug = slugify(name);
    const existing = await ServiceCategory.findOne({
      slug,
      _id: { $ne: (req.params.id as string) },
    });
    if (existing) slug = `${slug}-${Date.now()}`;
    update.slug = slug;
  }
  if (icon !== undefined) update.icon = icon;
  if (description !== undefined) update.description = description;

  if (ctaOptions !== undefined) {
    try {
      let parsed =
        typeof ctaOptions === "string" ? JSON.parse(ctaOptions) : ctaOptions;
      update.ctaOptions = (parsed || []).filter(
        (opt: any) => opt && opt.label && opt.label.trim(),
      );
    } catch {
      update.ctaOptions = [];
    }
  }

  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const category = await ServiceCategory.findByIdAndUpdate(
    (req.params.id as string),
    update,
    { returnDocument: "after" },
  );
  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }

  await invalidateCache("/v1/api/service-categories", "/v1/api/services");
  res.locals.data = category;
};

export const deleteCategory = async (req: Request, res: Response) => {
  const category = await ServiceCategory.findByIdAndDelete(req.params.id);
  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }
  res.locals.data = { message: "Category deleted" };
  await invalidateCache("/v1/api/service-categories", "/v1/api/services");
};
