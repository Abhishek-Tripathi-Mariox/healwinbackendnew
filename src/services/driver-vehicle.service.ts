import DriverVehicle from "../models/driver-vehicle.model";
import { IDriverVehicle } from "../interfaces/driver-vehicle";
import { Types } from "mongoose";

/**
 * Add driver vehicle
 */
export const addDriverVehicle = async (data: Partial<IDriverVehicle>) => {
  return await DriverVehicle.create(data);
};

/**
 * Get driver vehicle by ID
 */
export const getDriverVehicleById = async (id: string | Types.ObjectId) => {
  return await DriverVehicle.findById(id)
    .populate("vehicleTypeId")
    .select("-__v");
};

/**
 * Get driver vehicles
 */
export const getDriverVehicles = async (
  driverId: Types.ObjectId,
  includeDeleted: boolean = false
) => {
  const query: any = { driverId };

  if (!includeDeleted) {
    query.isDeleted = false;
  }

  return await DriverVehicle.find(query)
    .populate("vehicleTypeId")
    .select("-__v")
    .sort({ createdAt: -1 });
};

/**
 * Get active driver vehicle
 */
export const getActiveDriverVehicle = async (driverId: Types.ObjectId) => {
  return await DriverVehicle.findOne({
    driverId,
    isActive: true,
    isDeleted: false,
  })
    .populate("vehicleTypeId")
    .select("-__v");
};

/**
 * Update driver vehicle
 */
export const updateDriverVehicle = async (
  vehicleId: string | Types.ObjectId,
  data: Partial<IDriverVehicle>
) => {
  return await DriverVehicle.findByIdAndUpdate(
    vehicleId,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  ).populate("vehicleTypeId");
};

/**
 * Toggle vehicle online status
 */
export const toggleVehicleOnlineStatus = async (
  vehicleId: string | Types.ObjectId,
  isOnline: boolean
) => {
  return await DriverVehicle.findByIdAndUpdate(
    vehicleId,
    { isOnline },
    { returnDocument: "after" }
  );
};

/**
 * Soft delete driver vehicle
 */
export const softDeleteDriverVehicle = async (
  vehicleId: string | Types.ObjectId
) => {
  return await DriverVehicle.findByIdAndUpdate(
    vehicleId,
    {
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
      isOnline: false,
    },
    { returnDocument: "after" }
  );
};

/**
 * Check if registration number exists
 */
export const checkRegistrationExists = async (
  registrationNumber: string,
  excludeId?: Types.ObjectId
) => {
  const query: any = {
    registrationNumber: registrationNumber.toUpperCase(),
    isDeleted: false,
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const vehicle = await DriverVehicle.findOne(query);
  return !!vehicle;
};
