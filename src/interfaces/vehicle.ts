import { Types } from "mongoose";

export type VehicleType = "2W" | "3W" | "4W";

export interface IVehicle {
  driverId: Types.ObjectId;

  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleBodyType: string;
  fuelType: "Petrol" | "Diesel" | "CNG" | "EV";

  rcFrontImage: string;
  rcBackImage: string;

  isPrimary: boolean;
  isActive: boolean;
}
