import { Request, Response } from "express";
import PromoCode from "../../models/promo-code.model";
import * as PromoService from "../../services/promo.service";
import { Types } from "mongoose";

/**
 * Get all promo codes
 */
export const getAllPromos = async (req: Request, res: Response) => {
  const { status, search, page = 0, limit = 20 } = req.query;

  const query: any = { isDeleted: false };

  if (status === "active") {
    query.isActive = true;
    query.validTo = { $gte: new Date() };
  } else if (status === "expired") {
    query.validTo = { $lt: new Date() };
  } else if (status === "inactive") {
    query.isActive = false;
  }

  if (search) {
    query.$or = [
      { code: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const promos = await PromoCode.find(query)
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await PromoCode.countDocuments(query);

  res.locals.data = {
    promos,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

/**
 * Get promo by ID
 */
export const getPromoById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const promo = await PromoCode.findById(id).populate(
    "applicableVehicleTypes",
    "name",
  );

  if (!promo) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  res.locals.data = { promo };
};

/**
 * Create promo code
 */
export const createPromo = async (req: Request, res: Response) => {
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
  } = req.body;

  // Check if code already exists
  const existing = await PromoCode.findOne({
    code: code.toUpperCase(),
    isDeleted: false,
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Promo code already exists",
    });
  }

  const promo = await PromoService.createPromoCode({
    code: code.toUpperCase(),
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
    createdBy: new Types.ObjectId(req.adminId),
  });

  res.locals.data = {
    message: "Promo code created successfully",
    promo,
  };
};

/**
 * Update promo code
 */
export const updatePromo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  // Don't allow code change
  delete updateData.code;

  const promo = await PromoService.updatePromoCode(
    new Types.ObjectId(id),
    updateData,
  );

  if (!promo) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  res.locals.data = {
    message: "Promo code updated successfully",
    promo,
  };
};

/**
 * Delete promo code (soft delete)
 */
export const deletePromo = async (req: Request, res: Response) => {
  const { id } = req.params;

  const promo = await PromoService.deletePromoCode(new Types.ObjectId(id));

  if (!promo) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  res.locals.data = {
    message: "Promo code deleted successfully",
  };
};

/**
 * Get promo code usage stats
 */
export const getPromoStats = async (req: Request, res: Response) => {
  const { id } = req.params;

  const stats = await PromoService.getPromoCodeStats(new Types.ObjectId(id));

  res.locals.data = stats;
};

/**
 * Toggle promo code status
 */
export const togglePromoStatus = async (req: Request, res: Response) => {
  const { id } = req.params;

  const promo = await PromoCode.findById(id);

  if (!promo) {
    return res.status(404).json({
      success: false,
      message: "Promo code not found",
    });
  }

  promo.isActive = !promo.isActive;
  await promo.save();

  res.locals.data = {
    message: `Promo code ${promo.isActive ? "activated" : "deactivated"}`,
    promo,
  };
};
