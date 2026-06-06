import Vehicle from "../models/vehicle.model";
import { IVehicle } from "../interfaces/vehicle";
import { Types } from "mongoose";

/**
 * Add vehicle
 */
export const addVehicle = async (data: Partial<IVehicle>) => {
  return await Vehicle.create(data);
};

/**
 * Get vehicle by ID
 */
export const getVehicleById = async (id: string | Types.ObjectId) => {
  return await Vehicle.findById(id).select("-__v");
};

/**
 * Get driver vehicles
 */
export const getVehiclesByDriver = async (driverId: Types.ObjectId) => {
  return await Vehicle.find({ driverId, isActive: true })
    .select("-__v")
    .sort({ isPrimary: -1, createdAt: -1 });
};

/**
 * Get primary vehicle
 */
export const getPrimaryVehicle = async (driverId: Types.ObjectId) => {
  return await Vehicle.findOne({
    driverId,
    isPrimary: true,
    isActive: true,
  });
};

/**
 * Update vehicle
 */
export const updateVehicle = async (
  vehicleId: string | Types.ObjectId,
  data: Partial<IVehicle>
) => {
  return await Vehicle.findByIdAndUpdate(
    vehicleId,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
};

/**
 * Set primary vehicle
 */
export const setPrimaryVehicle = async (
  driverId: Types.ObjectId,
  vehicleId: Types.ObjectId
) => {
  // Remove primary flag from all other vehicles
  await Vehicle.updateMany(
    { driverId, _id: { $ne: vehicleId } },
    { isPrimary: false }
  );

  // Set this vehicle as primary
  return await Vehicle.findByIdAndUpdate(
    vehicleId,
    { isPrimary: true },
    { returnDocument: "after" }
  );
};

/**
 * Delete vehicle
 */
export const deleteVehicle = async (vehicleId: string | Types.ObjectId) => {
  return await Vehicle.findByIdAndUpdate(
    vehicleId,
    { isActive: false },
    { returnDocument: "after" }
  );
};
