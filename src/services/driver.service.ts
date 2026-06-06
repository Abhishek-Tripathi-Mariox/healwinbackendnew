import { Types } from "mongoose";
import Driver from "../models/driver.model";
import { IDriver, DriverStatus } from "../interfaces/driver";

/**
 * Create driver
 */
export const createDriver = async (data: Partial<IDriver>) => {
  return await Driver.create(data);
};

/**
 * Fetch driver by ID
 */
export const getDriverById = async (id: string | Types.ObjectId) => {
  return await Driver.findById(id).select("-__v");
};

/**
 * Fetch driver by query
 */
export const getDriverByQuery = async (query: any) => {
  return await Driver.findOne(query).select("-__v");
};

/**
 * Fetch driver by mobile number
 */
export const getDriverByMobile = async (
  mobileNumber: string,
  countryCode: string = "+91"
) => {
  return await Driver.findOne({
    mobileNumber,
    countryCode,
    isDeleted: false,
  });
};

/**
 * Update driver
 */
export const updateDriver = async (
  driverId: string | Types.ObjectId,
  data: Partial<IDriver>
) => {
  return await Driver.findByIdAndUpdate(
    driverId,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
};

/**
 * Update driver status
 */
export const updateDriverStatus = async (
  driverId: string | Types.ObjectId,
  status: DriverStatus,
  reason?: string
) => {
  const updateData: any = { status };

  if (status === "rejected" && reason) {
    updateData.rejectionReason = reason;
  }

  if (status === "suspended" && reason) {
    updateData.suspensionReason = reason;
  }

  return await Driver.findByIdAndUpdate(driverId, updateData, { returnDocument: "after" });
};
