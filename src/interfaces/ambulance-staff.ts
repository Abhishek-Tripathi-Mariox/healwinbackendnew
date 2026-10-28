import { Document, Types } from "mongoose";
import type { ISalaryStructure } from "../models/hr-employee.model";

export type AmbulanceStaffRole = "driver" | "attendant";

export interface IAmbulanceStaff extends Document {
  _id: Types.ObjectId;
  mobileNumber: string;
  countryCode: string;
  role: AmbulanceStaffRole;
  // Mutually-exclusive employer link enforced by the model:
  //   driver    → providerId set, hospitalId null
  //   attendant → hospitalId set, providerId null
  // Both null OR both set is rejected at save time.
  providerId?: Types.ObjectId | null;
  hospitalId?: Types.ObjectId | null;
  fullName: string;
  email?: string;
  gender?: "Male" | "Female" | "Other";
  dob?: string;
  profilePhoto?: string;
  licenseNumber?: string;
  licenseImage?: string;
  certifications?: string[];
  certificationImages?: string[];
  fcmToken?: string | null;
  isOnline: boolean;
  isDutyOn: boolean;
  lastSeenAt?: Date;
  lastLocationAttemptAt?: Date;
  /**
   * Where this crew member last actually was. Only the attempt timestamp
   * used to be kept, so there was no way to ask "where is the assigned
   * driver?" — the position was written straight onto the vehicle by
   * whichever crew member pinged, driver or attendant.
   */
  currentLocation?: { type: "Point"; coordinates: [number, number] };
  lastLocationAt?: Date;
  isActive: boolean;
  isDeleted: boolean;
  salaryStructure?: ISalaryStructure;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
