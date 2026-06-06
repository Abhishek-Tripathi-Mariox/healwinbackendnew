import { Types } from "mongoose";

export interface IVehicleType {
  _id?: Types.ObjectId;

  name: string;
  description?: string;
  maxWeightKg: number;

  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minDistanceKm: number;

  surgeMultiplier?: number;
  cancellationFee?: number;

  // Booking range limits
  minRangeKm: number;
  maxRangeKm: number;

  // Service area settings
  allowIntraCity: boolean;
  allowInterCity: boolean;

  image?: string;
  icon?: string;
  sortOrder?: number;
  isActive: boolean;
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}
