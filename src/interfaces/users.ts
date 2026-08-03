import { Document, Types } from "mongoose";

export type Gender = "Male" | "Female" | "Other";

export interface IUser extends Document {
  fullName: string;
  // Set when this user was auto-linked as a family dependent (their phone
  // matched a PatientFamilyMember row someone else created) — points at the
  // ROOT head of the family group, never at an intermediate dependent, so
  // resolving the whole family is always a single flat query. Unset for a
  // head/independent user. See user.service.ts#addUsers.
  headUserId?: Types.ObjectId;
  email: string;
  profileImage: string;
  gender: Gender;
  dob: string;
  age: string;
  idType: string;
  idNumber: string;
  countryCode: string;
  mobileNumber: string;
  isActive: boolean;
  isDeleted: boolean;
  isBlocked?: boolean;
  blockedAt?: Date | null;
  blockReason?: string | null;
  notificationAllowed: boolean;
  token?: string | null;
  deviceToken?: string | null;
  deviceType?: string | null;
  referralCode?: string | null;
}
