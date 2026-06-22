import { Request, Response, NextFunction } from "express";
import PromoCode from "../../models/promo-code.model";
import * as PromoService from "../../services/promo.service";
import { Types } from "mongoose";

/**
 * Admin CRUD for promo codes (logistics + ambulance). Mounted at /admin/promos.
 * Follows the req.rData / req.msg + ResponseMiddleware convention.
 */

/** GET /admin/promos — paginated list with status + text search. */
export const getAllPromos = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { status, search, serviceCategory, page = 0, limit = 20 } = req.query;

  const query: any = { isDeleted: false };

  if (status === "active") {
    query.isActive = true;
    query.validTo = { $gte: new Date() };
  } else if (status === "expired") {
    query.validTo = { $lt: new Date() };
  } else if (status === "inactive") {
    query.isActive = false;
  }

  if (serviceCategory) query.serviceCategory = serviceCategory;

  if (search) {
    query.$or = [
      { code: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [promos, total] = await Promise.all([
    PromoCode.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(page) * Number(limit))
      .limit(Number(limit))
      .lean(),
    PromoCode.countDocuments(query),
  ]);

  req.rData = {
    promos,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/promos/:id */
export const getPromoById = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const promo = await PromoCode.findById(id).populate(
    "applicableVehicleTypes",
    "name",
  );
  if (!promo) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { promo };
  req.msg = "success";
  return next();
};

/** POST /admin/promos */
export const createPromo = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    maxDiscount,
    minOrderValue,
    maxUsage,
    perUserLimit,
    validFrom,
    validTo,
    applicableVehicleTypes,
    applicableServiceTypes,
    serviceCategory,
  } = req.body || {};

  if (!code || !description || !discountType || discountValue == null || !validFrom || !validTo) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "code, description, discountType, discountValue, validFrom and validTo are required",
    };
    return next();
  }

  const existing = await PromoCode.findOne({
    code: String(code).toUpperCase(),
    isDeleted: false,
  });
  if (existing) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Promo code already exists" };
    return next();
  }

  const promo = await PromoService.createPromoCode({
    code: String(code).toUpperCase(),
    description,
    discountType,
    discountValue,
    maxDiscount,
    minOrderValue: minOrderValue || 0,
    maxUsage: maxUsage || -1,
    perUserLimit: perUserLimit || 1,
    validFrom: new Date(validFrom),
    validTo: new Date(validTo),
    applicableVehicleTypes,
    applicableServiceTypes,
    serviceCategory: serviceCategory || "LOGISTICS",
    createdBy: new Types.ObjectId((req as any).adminId),
  });

  req.rData = { promo };
  req.msg = "success";
  return next();
};

/** PUT /admin/promos/:id */
export const updatePromo = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const updateData = { ...req.body };

  // The code itself is immutable once created (it's been shared/printed).
  delete updateData.code;

  const promo = await PromoService.updatePromoCode(
    new Types.ObjectId(id),
    updateData,
  );
  if (!promo) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { promo };
  req.msg = "success";
  return next();
};

/** DELETE /admin/promos/:id — soft delete. */
export const deletePromo = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const promo = await PromoService.deletePromoCode(new Types.ObjectId(id));
  if (!promo) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = {};
  req.msg = "success";
  return next();
};

/** GET /admin/promos/:id/stats */
export const getPromoStats = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const stats = await PromoService.getPromoCodeStats(new Types.ObjectId(id));
  req.rData = stats;
  req.msg = "success";
  return next();
};

/** PATCH /admin/promos/:id/toggle */
export const togglePromoStatus = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const promo = await PromoCode.findById(id);
  if (!promo) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  promo.isActive = !promo.isActive;
  await promo.save();
  req.rData = { promo };
  req.msg = "success";
  return next();
};
