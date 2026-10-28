import { Document, Types } from "mongoose";

export type AmbulanceType = "BLS" | "ALS" | "ICU" | "PTV";
export type AmbulanceStatus = "available" | "on_dispatch" | "offline" | "maintenance";
export type FuelType = "Petrol" | "Diesel" | "CNG" | "EV";

export interface IAmbulance extends Document {
  _id: Types.ObjectId;
  providerId: Types.ObjectId;
  registrationNumber: string;
  ambulanceType: AmbulanceType;
  equipment: string[];
  fuelType?: FuelType;
  rcFrontImage?: string;
  rcBackImage?: string;
  assignedDriverId: Types.ObjectId | null;
  /** @deprecated read via attendantIdsOf(); `assignedAttendantIds` is the source. */
  assignedAttendantId: Types.ObjectId | null;
  assignedAttendantIds?: Types.ObjectId[];
  currentLocation: { type: "Point"; coordinates: [number, number] };
  lastLocationAt?: Date;
  status: AmbulanceStatus;
  currentDispatchId: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
