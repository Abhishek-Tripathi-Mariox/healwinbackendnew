import { Request, Response } from "express";
import { LocatorServiceType } from "../../models/locator-service-type.model";
import { paginate } from "../../utils/paginate.util";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const getAllLocatorServiceTypes = async (
  req: Request,
  res: Response,
) => {
  const { status, q, applicableTo } = req.query as {
    status?: string;
    q?: string;
    applicableTo?: string;
  };
  const filter: Record<string, any> = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (applicableTo) filter.applicableTo = applicableTo;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }
  const result = await paginate(LocatorServiceType, filter, req, {
    sortOrder: 1,
    createdAt: -1,
  });
  res.locals.data = result;
};

export const getLocatorServiceTypeById = async (
  req: Request,
  res: Response,
) => {
  const type = await LocatorServiceType.findById(req.params.id);
  if (!type)
    return res
      .status(404)
      .json({ success: false, message: "Service type not found" });
  res.locals.data = type;
};

export const createLocatorServiceType = async (req: Request, res: Response) => {
  const { name, description, icon, applicableTo, isActive, sortOrder } =
    req.body;
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Name is required" });
  }
  let slug = slugify(name);
  const existing = await LocatorServiceType.findOne({ slug });
  if (existing) slug = `${slug}-${Date.now()}`;

  const type = await LocatorServiceType.create({
    name,
    slug,
    description: description || "",
    icon: icon || "Building2",
    applicableTo: applicableTo || "centre_locator",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  res.locals.data = type;
};

export const updateLocatorServiceType = async (req: Request, res: Response) => {
  const { name, description, icon, applicableTo, isActive, sortOrder } =
    req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) {
    update.name = name;
    let slug = slugify(name);
    const existing = await LocatorServiceType.findOne({
      slug,
      _id: { $ne: (req.params.id as string) },
    });
    if (existing) slug = `${slug}-${Date.now()}`;
    update.slug = slug;
  }
  if (description !== undefined) update.description = description;
  if (icon !== undefined) update.icon = icon;
  if (applicableTo !== undefined) update.applicableTo = applicableTo;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const type = await LocatorServiceType.findByIdAndUpdate(
    (req.params.id as string),
    update,
    { returnDocument: "after" },
  );
  if (!type)
    return res
      .status(404)
      .json({ success: false, message: "Service type not found" });
  res.locals.data = type;
};

export const deleteLocatorServiceType = async (req: Request, res: Response) => {
  const type = await LocatorServiceType.findByIdAndDelete(req.params.id);
  if (!type)
    return res
      .status(404)
      .json({ success: false, message: "Service type not found" });
  res.locals.data = { message: "Service type deleted" };
};
