import VehicleType from "../models/vehicle-type.model";
import { IVehicleType } from "../interfaces/vehicle-type";
import { Types } from "mongoose";

/**
 * Create vehicle type
 */
export const createVehicleType = async (data: Partial<IVehicleType>) => {
  return await VehicleType.create(data);
};

/**
 * Get vehicle type by ID
 */
export const getVehicleTypeById = async (id: string | Types.ObjectId) => {
  return await VehicleType.findById(id).populate("categoryId").select("-__v");
};

/**
 * Get vehicle types by category
 */
export const getVehicleTypesByCategory = async (
  categoryId: Types.ObjectId,
  activeOnly: boolean = true
) => {
  const query: any = { categoryId };

  if (activeOnly) {
    query.isActive = true;
  }

  return await VehicleType.find(query)
    .populate("categoryId")
    .select("-__v")
    .sort({ name: 1 });
};

/**
 * Get all active vehicle types
 */
export const getActiveVehicleTypes = async () => {
  return await VehicleType.find({ isActive: true })
    .populate("categoryId")
    .select("-__v")
    .sort({ name: 1 });
};

/**
 * Update vehicle type
 */
export const updateVehicleType = async (
  typeId: string | Types.ObjectId,
  data: Partial<IVehicleType>
) => {
  return await VehicleType.findByIdAndUpdate(
    typeId,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  ).populate("categoryId");
};

/**
 * Calculate fare
 */
export const calculateFare = async (
  vehicleTypeId: Types.ObjectId,
  distanceKm: number,
  durationMin: number,
  applySurge: boolean = false
) => {
  const vehicleType = await VehicleType.findById(vehicleTypeId);

  if (!vehicleType) {
    throw new Error("Vehicle type not found");
  }

  // Apply minimum distance
  const actualDistance = Math.max(distanceKm, vehicleType.minDistanceKm);

  // Calculate base fare
  let fare =
    vehicleType.baseFare +
    actualDistance * vehicleType.perKmRate +
    durationMin * vehicleType.perMinuteRate;

  // Apply surge pricing if enabled
  let surgeFare = 0;
  if (
    applySurge &&
    vehicleType.surgeMultiplier &&
    vehicleType.surgeMultiplier > 1
  ) {
    surgeFare = fare * (vehicleType.surgeMultiplier - 1);
    fare += surgeFare;
  }

  return {
    baseFare: vehicleType.baseFare,
    distanceFare: actualDistance * vehicleType.perKmRate,
    timeFare: durationMin * vehicleType.perMinuteRate,
    surgeFare,
    totalFare: Math.round(fare * 100) / 100, // Round to 2 decimals
    vehicleType,
  };
};

/**
 * Delete vehicle type
 */
export const deleteVehicleType = async (typeId: string | Types.ObjectId) => {
  return await VehicleType.findByIdAndUpdate(
    typeId,
    { isActive: false },
    { returnDocument: "after" }
  );
};
