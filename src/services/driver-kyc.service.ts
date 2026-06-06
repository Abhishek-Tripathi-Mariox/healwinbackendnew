import DriverKyc from "../models/driver-kyc.model";
import { IDriverKyc } from "../interfaces/driver-kyc";
import { Types } from "mongoose";

/**
 * Create or update driver KYC
 */
export const upsertDriverKyc = async (
  driverId: Types.ObjectId,
  data: Partial<IDriverKyc>
) => {
  return await DriverKyc.findOneAndUpdate(
    { driverId },
    { $set: data },
    { upsert: true, returnDocument: "after", runValidators: true }
  );
};

/**
 * Get driver KYC
 */
export const getDriverKyc = async (driverId: Types.ObjectId) => {
  return await DriverKyc.findOne({ driverId }).select("-__v");
};

/**
 * Verify driver KYC
 */
export const verifyDriverKyc = async (driverId: Types.ObjectId) => {
  return await DriverKyc.findOneAndUpdate(
    { driverId },
    {
      isVerified: true,
      verifiedAt: new Date(),
    },
    { returnDocument: "after" }
  );
};

/**
 * Check if KYC is complete
 */
export const isKycComplete = async (driverId: Types.ObjectId) => {
  const kyc = await DriverKyc.findOne({ driverId });

  if (!kyc) return false;

  return !!(
    kyc.aadhaar?.number &&
    kyc.aadhaar?.frontImage &&
    kyc.aadhaar?.backImage &&
    kyc.pan?.number &&
    kyc.pan?.frontImage &&
    kyc.drivingLicense?.number &&
    kyc.drivingLicense?.frontImage &&
    kyc.drivingLicense?.backImage &&
    kyc.selfie
  );
};
