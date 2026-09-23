import { Request, Response, NextFunction } from "express";
import HomePromo from "../../models/home-promo.model";
import { getPaginationParams } from "../../utils/paginate.util";
import { escapeRegex } from "../../utils/helpers";

/**
 * Admin CRUD for patient-app home promo shortcut cards. `target` must be one of
 * the app's known route names — the app silently ignores unknown targets.
 */

const sanitize = (b: any) => {
  const patch: any = {};
  if (typeof b.titleTop === "string") patch.titleTop = b.titleTop;
  if (Array.isArray(b.titleBold)) patch.titleBold = b.titleBold.map((s: any) => String(s)).filter(Boolean);
  if (typeof b.cta === "string") patch.cta = b.cta.trim();
  if (typeof b.target === "string") patch.target = b.target.trim();
  if (typeof b.image === "string") patch.image = b.image;
  if (b.sortOrder !== undefined) patch.sortOrder = Number(b.sortOrder) || 0;
  if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
  return patch;
};

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const { search, isActive } = req.query;
  const filter: Record<string, any> = { isDeleted: { $ne: true } };
  if (typeof search === "string" && search.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    // titleBold is an array of lines; a scalar regex matches any element.
    filter.$or = [{ titleTop: rx }, { titleBold: rx }, { cta: rx }, { target: rx }];
  }
  if (typeof isActive === "string") filter.isActive = isActive === "true";

  const { page, limit, skip } = getPaginationParams(req, { defaultLimit: 25 });
  const [items, total] = await Promise.all([
    HomePromo.find(filter).sort({ sortOrder: 1, createdAt: 1 }).skip(skip).limit(limit).lean(),
    HomePromo.countDocuments(filter),
  ]);
  req.rData = {
    items,
    total,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
  req.msg = "home_promos_listed";
  next();
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  const patch = sanitize(req.body);
  if (!patch.target) {
    return res.status(400).json({ rCode: 0, rMsg: "target_required", rData: {} });
  }
  const item = await HomePromo.create({ ...patch, isActive: patch.isActive ?? true, isDeleted: false });
  req.rData = { item };
  req.msg = "home_promo_created";
  next();
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  const item = await HomePromo.findByIdAndUpdate(
    req.params.id,
    sanitize(req.body),
    { returnDocument: "after" },
  ).lean();
  if (!item) return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  req.rData = { item };
  req.msg = "home_promo_updated";
  next();
};

export const toggle = async (req: Request, res: Response, next: NextFunction) => {
  const promo = await HomePromo.findById(req.params.id);
  if (!promo) return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  promo.isActive = !promo.isActive;
  await promo.save();
  req.rData = { item: promo };
  req.msg = "home_promo_toggled";
  next();
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  const item = await HomePromo.findByIdAndUpdate(
    req.params.id,
    { isDeleted: true, isActive: false },
    { returnDocument: "after" },
  ).lean();
  if (!item) return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  req.rData = {};
  req.msg = "home_promo_deleted";
  next();
};
