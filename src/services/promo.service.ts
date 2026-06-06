import PromoCode, { IPromoCode } from "../models/promo-code.model";
import PromoUsage from "../models/promo-usage.model";
import { Types } from "mongoose";

/**
 * Get all active promo codes
 */
export const getActivePromoCodes = async () => {
  const now = new Date();
  return await PromoCode.find({
    isActive: true,
    isDeleted: false,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    $or: [{ maxUsage: -1 }, { $expr: { $lt: ["$usedCount", "$maxUsage"] } }],
  }).sort({ createdAt: -1 });
};

/**
 * Validate promo code
 */
export const validatePromoCode = async (
  code: string,
  userId: Types.ObjectId,
  orderValue: number,
  vehicleTypeId?: Types.ObjectId,
  serviceType?: string,
) => {
  const now = new Date();

  const promo = await PromoCode.findOne({
    code: code.toUpperCase(),
    isActive: true,
    isDeleted: false,
    validFrom: { $lte: now },
    validTo: { $gte: now },
  });

  if (!promo) {
    return { valid: false, error: "Invalid or expired promo code" };
  }

  // Check max usage
  if (promo.maxUsage !== -1 && promo.usedCount >= promo.maxUsage) {
    return { valid: false, error: "Promo code usage limit reached" };
  }

  // Check minimum order value
  if (orderValue < promo.minOrderValue) {
    return {
      valid: false,
      error: `Minimum order value should be ₹${promo.minOrderValue}`,
    };
  }

  // Check per user limit
  const userUsageCount = await PromoUsage.countDocuments({
    userId,
    promoCodeId: promo._id,
  });

  if (userUsageCount >= promo.perUserLimit) {
    return { valid: false, error: "You have already used this promo code" };
  }

  // Check vehicle type applicability
  if (
    promo.applicableVehicleTypes &&
    promo.applicableVehicleTypes.length > 0 &&
    vehicleTypeId
  ) {
    const isApplicable = promo.applicableVehicleTypes.some(
      (vt) => vt.toString() === vehicleTypeId.toString(),
    );
    if (!isApplicable) {
      return {
        valid: false,
        error: "Promo code not applicable for this vehicle type",
      };
    }
  }

  // Check service type applicability
  if (
    promo.applicableServiceTypes &&
    promo.applicableServiceTypes.length > 0 &&
    serviceType
  ) {
    if (!promo.applicableServiceTypes.includes(serviceType as any)) {
      return {
        valid: false,
        error: "Promo code not applicable for this service type",
      };
    }
  }

  // Calculate discount
  let discountAmount = 0;
  if (promo.discountType === "PERCENTAGE") {
    discountAmount = (orderValue * promo.discountValue) / 100;
    if (promo.maxDiscount && discountAmount > promo.maxDiscount) {
      discountAmount = promo.maxDiscount;
    }
  } else {
    discountAmount = promo.discountValue;
  }

  // Ensure discount doesn't exceed order value
  if (discountAmount > orderValue) {
    discountAmount = orderValue;
  }

  return {
    valid: true,
    promo,
    discountAmount: Math.round(discountAmount * 100) / 100,
  };
};

/**
 * Apply promo code to booking
 */
export const applyPromoCode = async (
  promoCodeId: Types.ObjectId,
  userId: Types.ObjectId,
  bookingId: Types.ObjectId,
  discountAmount: number,
) => {
  // Record usage
  await PromoUsage.create({
    userId,
    promoCodeId,
    bookingId,
    discountAmount,
  });

  // Increment usage count
  await PromoCode.findByIdAndUpdate(promoCodeId, {
    $inc: { usedCount: 1 },
  });
};

/**
 * Create promo code (Admin)
 */
export const createPromoCode = async (data: Partial<IPromoCode>) => {
  return await PromoCode.create(data);
};

/**
 * Update promo code (Admin)
 */
export const updatePromoCode = async (
  id: Types.ObjectId,
  data: Partial<IPromoCode>,
) => {
  return await PromoCode.findByIdAndUpdate(id, data, { returnDocument: "after" });
};

/**
 * Delete promo code (soft delete)
 */
export const deletePromoCode = async (id: Types.ObjectId) => {
  return await PromoCode.findByIdAndUpdate(id, { isDeleted: true });
};

/**
 * Get promo code usage stats
 */
export const getPromoCodeStats = async (promoCodeId: Types.ObjectId) => {
  const usages = await PromoUsage.find({ promoCodeId })
    .populate("userId", "fullName mobileNumber")
    .populate("bookingId", "bookingNumber finalFare")
    .sort({ createdAt: -1 })
    .limit(100);

  const totalDiscount = await PromoUsage.aggregate([
    { $match: { promoCodeId } },
    { $group: { _id: null, total: { $sum: "$discountAmount" } } },
  ]);

  return {
    usages,
    totalDiscount: totalDiscount[0]?.total || 0,
    totalUsage: usages.length,
  };
};
