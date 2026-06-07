import { Request, Response } from "express";
import PromoCode from "../models/promo-code.model";
import PromoUsage from "../models/promo-usage.model";
import * as PromoService from "../services/promo.service";

/**
 * Validate promo code
 */
export const validatePromo = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { code, amount, vehicleTypeId, serviceType } = req.body;

    if (!code || !amount) {
      return res.status(400).json({
        success: false,
        message: "Promo code and amount are required",
      });
    }

    const result = await PromoService.validatePromoCode(
      code,
      userId,
      amount,
      vehicleTypeId,
      serviceType,
    );

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.json({
      success: true,
      message: "Promo code is valid",
      data: {
        code: result.promo?.code,
        discountType: result.promo?.discountType,
        discountValue: result.promo?.discountValue,
        discount: result.discountAmount,
        description: result.promo?.description,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to validate promo code",
    });
  }
};

/**
 * Get available promos for user
 */
export const getAvailablePromos = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { vehicleTypeId, serviceType } = req.query;

    const now = new Date();

    // Build query for active promos
    const query: any = {
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { usageLimit: { $exists: false } },
        { usageCount: { $lt: "$usageLimit" } },
      ],
    };

    // Filter by vehicle type if provided
    if (vehicleTypeId) {
      query.$or = [
        { applicableVehicleTypes: { $size: 0 } },
        { applicableVehicleTypes: vehicleTypeId },
      ];
    }

    // Filter by service type if provided
    if (serviceType) {
      query.$or = [
        { applicableServiceTypes: { $size: 0 } },
        { applicableServiceTypes: serviceType },
      ];
    }

    const promos = await PromoCode.find(query)
      .select(
        "code description discountType discountValue maxDiscount minOrderValue validTo perUserLimit",
      )
      .sort({ createdAt: -1 });

    // Filter out promos user has already used up their limit
    const filteredPromos = await Promise.all(
      promos.map(async (promo) => {
        const userUsageCount = await PromoUsage.countDocuments({
          promoCodeId: promo._id,
          userId,
        });

        if (promo.perUserLimit && userUsageCount >= promo.perUserLimit) {
          return null;
        }

        return {
          code: promo.code,
          description: promo.description,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          maxDiscount: promo.maxDiscount,
          minOrderValue: promo.minOrderValue,
          expiresAt: promo.validTo,
          usedCount: userUsageCount,
          remainingUses: promo.perUserLimit
            ? promo.perUserLimit - userUsageCount
            : null,
        };
      }),
    );

    res.json({
      success: true,
      data: filteredPromos.filter(Boolean),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch available promos",
    });
  }
};

/**
 * Get promo details
 */
export const getPromoDetails = async (req: Request, res: Response) => {
  try {
    const { code } = req.params as Record<string, string>;
    const userId = (req as any).user._id;

    const promo = await PromoCode.findOne({
      code: code.toUpperCase(),
      isActive: true,
    }).select(
      "code description discountType discountValue maxDiscount minOrderValue validTo applicableVehicleTypes applicableServiceTypes perUserLimit",
    );

    if (!promo) {
      return res.status(404).json({
        success: false,
        message: "Promo code not found",
      });
    }

    // Get user's usage count
    const userUsageCount = await PromoUsage.countDocuments({
      promoCodeId: promo._id,
      userId,
    });

    res.json({
      success: true,
      data: {
        code: promo.code,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
        minOrderValue: promo.minOrderValue,
        expiresAt: promo.validTo,
        usedCount: userUsageCount,
        remainingUses: promo.perUserLimit
          ? Math.max(0, promo.perUserLimit - userUsageCount)
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch promo details",
    });
  }
};
