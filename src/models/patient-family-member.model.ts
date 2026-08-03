import mongoose, { Schema, Types } from "mongoose";

/**
 * Patient-app family member. Each row belongs to the patient (userId) who
 * created it. Replaces the earlier in-memory stub so members persist across
 * restarts.
 */
export interface IPatientFamilyMember {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  relation: string;
  phone?: string;
  age?: string;
  gender?: string;
  photo?: string;
  bloodGroup?: string;
  conditions?: string[];
  // Set once this profile's phone actually signs up in the app and gets
  // auto-linked as a real dependent under `userId` (the head) — see
  // user.service.ts#addUsers. Until then this is just a static profile with
  // no login of its own.
  linkedUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PatientFamilyMemberSchema = new Schema<IPatientFamilyMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    relation: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    age: { type: String, trim: true },
    gender: { type: String, trim: true },
    photo: { type: String, trim: true },
    bloodGroup: { type: String, trim: true },
    conditions: { type: [String], default: [] },
    linkedUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true },
);

export const PatientFamilyMember = mongoose.model<IPatientFamilyMember>(
  "PatientFamilyMember",
  PatientFamilyMemberSchema,
);

export default PatientFamilyMember;
