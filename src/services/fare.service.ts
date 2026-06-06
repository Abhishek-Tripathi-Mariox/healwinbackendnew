import { FareConfig } from "../models/app-config.model";
import VehicleType from "../models/vehicle-type.model";
import { Types } from "mongoose";

export interface FareBreakdown {
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  surgeCharge: number;
  surgeMultiplier: number;
  addonCharges: number;
  loadingUnloadingCharge: number;
  waitingCharge: number;
  tollCharges: number;
  subtotal: number;
  gstAmount: number;
  gstPercentage: number;
  promoDiscount: number;
  coinDiscount: number;
  totalDiscount: number;
  finalFare: number;
}

export interface FareCalculationInput {
  vehicleTypeId: Types.ObjectId;
  distanceKm: number;
  durationMin: number;
  isScheduled?: boolean;
  scheduledTime?: Date;
  serviceType?: "WITHIN_CITY" | "OUTSTATION";
  addons?: { addonId: Types.ObjectId; price: number; quantity: number }[];
  loadingUnloadingCharge?: number;
  tollCharges?: number;
  promoDiscount?: number;
  coinDiscount?: number;
  stops?: number; // Number of additional stops
}

/**
 * Get current surge multiplier based on time and conditions
 */
const getSurgeMultiplier = async (scheduledTime?: Date): Promise<number> => {
  const fareConfig = await FareConfig.findOne({ isActive: true });
  if (!fareConfig) return 1;

  const now = scheduledTime || new Date();
  const hour = now.getHours();

  // Night surge
  if (
    hour >= fareConfig.nightSurgeStartHour ||
    hour < fareConfig.nightSurgeEndHour
  ) {
    return fareConfig.nightSurgeMultiplier;
  }

  // Peak hour surge
  if (hour >= fareConfig.peakHourStart && hour < fareConfig.peakHourEnd) {
    return fareConfig.peakHourSurgeMultiplier;
  }

  return 1;
};

/**
 * Calculate fare for a booking
 */
export const calculateFare = async (
  input: FareCalculationInput,
): Promise<FareBreakdown> => {
  // Get vehicle type pricing
  const vehicleType = await VehicleType.findById(input.vehicleTypeId);
  if (!vehicleType) {
    throw new Error("Invalid vehicle type");
  }

  // Get fare config
  const fareConfig = await FareConfig.findOne({ isActive: true });
  const gstPercentage = fareConfig?.gstPercentage || 5;
  const minimumFare = fareConfig?.minimumFare || 50;

  // Calculate base fare
  const baseFare = vehicleType.baseFare;

  // Calculate distance charge
  const chargeableDistance = Math.max(
    0,
    input.distanceKm - vehicleType.minDistanceKm,
  );
  const distanceCharge = chargeableDistance * vehicleType.perKmRate;

  // Calculate time charge
  const timeCharge = input.durationMin * vehicleType.perMinuteRate;

  // Get surge multiplier
  const surgeMultiplier = await getSurgeMultiplier(input.scheduledTime);
  const baseFareWithSurge = baseFare + distanceCharge + timeCharge;
  const surgeCharge =
    surgeMultiplier > 1 ? baseFareWithSurge * (surgeMultiplier - 1) : 0;

  // Calculate addon charges
  let addonCharges = 0;
  if (input.addons && input.addons.length > 0) {
    addonCharges = input.addons.reduce(
      (sum, addon) => sum + addon.price * addon.quantity,
      0,
    );
  }

  // Additional stop charges (₹30 per stop)
  const stopCharges = (input.stops || 0) * 30;

  // Loading/Unloading charges
  const loadingUnloadingCharge = input.loadingUnloadingCharge || 0;

  // Toll charges
  const tollCharges = input.tollCharges || 0;

  // Calculate subtotal
  let subtotal =
    baseFare +
    distanceCharge +
    timeCharge +
    surgeCharge +
    addonCharges +
    stopCharges +
    loadingUnloadingCharge +
    tollCharges;

  // Apply minimum fare
  if (subtotal < minimumFare) {
    subtotal = minimumFare;
  }

  // Calculate GST
  const gstAmount = (subtotal * gstPercentage) / 100;
  const totalWithGst = subtotal + gstAmount;

  // Calculate discounts
  const promoDiscount = input.promoDiscount || 0;
  const coinDiscount = input.coinDiscount || 0;
  const totalDiscount = promoDiscount + coinDiscount;

  // Calculate final fare
  const finalFare = Math.max(0, totalWithGst - totalDiscount);

  return {
    baseFare: Math.round(baseFare * 100) / 100,
    distanceCharge: Math.round(distanceCharge * 100) / 100,
    timeCharge: Math.round(timeCharge * 100) / 100,
    surgeCharge: Math.round(surgeCharge * 100) / 100,
    surgeMultiplier,
    addonCharges: Math.round((addonCharges + stopCharges) * 100) / 100,
    loadingUnloadingCharge: Math.round(loadingUnloadingCharge * 100) / 100,
    waitingCharge: 0, // Calculated after trip
    tollCharges: Math.round(tollCharges * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    gstPercentage,
    promoDiscount: Math.round(promoDiscount * 100) / 100,
    coinDiscount: Math.round(coinDiscount * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    finalFare: Math.round(finalFare * 100) / 100,
  };
};

/**
 * Calculate waiting charges after trip
 */
export const calculateWaitingCharges = async (
  waitingMinutes: number,
): Promise<number> => {
  const fareConfig = await FareConfig.findOne({ isActive: true });
  const freeWaitingMinutes = fareConfig?.freeWaitingMinutes || 10;
  const waitingChargePerMin = fareConfig?.waitingChargePerMin || 2;

  const chargeableMinutes = Math.max(0, waitingMinutes - freeWaitingMinutes);
  return Math.round(chargeableMinutes * waitingChargePerMin * 100) / 100;
};

/**
 * Recalculate fare after trip completion
 */
export const recalculateFareAfterTrip = async (
  originalFare: FareBreakdown,
  actualDistanceKm: number,
  actualDurationMin: number,
  waitingMinutes: number,
  additionalTolls: number = 0,
): Promise<FareBreakdown> => {
  const waitingCharge = await calculateWaitingCharges(waitingMinutes);

  // For now, keep the original fare but add waiting and toll charges
  // In production, you might recalculate based on actual distance
  const newSubtotal = originalFare.subtotal + waitingCharge + additionalTolls;
  const gstAmount = (newSubtotal * originalFare.gstPercentage) / 100;
  const totalWithGst = newSubtotal + gstAmount;
  const finalFare = Math.max(0, totalWithGst - originalFare.totalDiscount);

  return {
    ...originalFare,
    waitingCharge,
    tollCharges: originalFare.tollCharges + additionalTolls,
    subtotal: Math.round(newSubtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    finalFare: Math.round(finalFare * 100) / 100,
  };
};

/**
 * Get fare estimate for display
 */
export const getFareEstimate = async (
  vehicleTypeId: Types.ObjectId,
  distanceKm: number,
  durationMin: number,
  serviceType: "WITHIN_CITY" | "OUTSTATION" = "WITHIN_CITY",
) => {
  const fare = await calculateFare({
    vehicleTypeId,
    distanceKm,
    durationMin,
    serviceType,
  });

  // Add 10% buffer for estimate range
  const minFare = Math.round(fare.finalFare * 0.9);
  const maxFare = Math.round(fare.finalFare * 1.1);

  return {
    estimatedFare: fare.finalFare,
    fareRange: { min: minFare, max: maxFare },
    breakdown: fare,
  };
};
