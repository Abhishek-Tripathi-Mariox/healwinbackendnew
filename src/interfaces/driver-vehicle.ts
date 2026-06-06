import { Types } from "mongoose";

export interface IDriverVehicle {
  _id?: Types.ObjectId;
  driverId: Types.ObjectId;
  vehicleTypeId: Types.ObjectId;

  registrationNumber: string;
  isOnline: boolean;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
