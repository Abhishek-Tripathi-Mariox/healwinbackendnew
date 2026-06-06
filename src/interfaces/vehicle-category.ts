import { Types } from "mongoose";

export interface IVehicleCategory {
  _id?: Types.ObjectId;
  name: string; // 2 Wheeler, 3 Wheeler, Truck
  code: string; // BIKE, AUTO, TRUCK
  icon?: string; // icon URL
  isActive: boolean;
}
