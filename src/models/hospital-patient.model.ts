import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Patient Registration & Demographics.
 *
 * This is a HOSPITAL patient record captured by hospital staff/doctors. It is
 * deliberately separate from the patient-app `User` model: a walk-in OPD patient
 * may never have installed the app, and an app user may never have a clinical
 * record. The two can be linked later via `appUserId` if needed.
 *
 * A unique, human-readable `patientId` (e.g. HWP-000123) is auto-generated on
 * create via the atomic Counter sequence to avoid duplication.
 */

export interface IEmergencyContact {
  name: string;
  relation?: string;
  phone: string;
}

export interface IPatientDocument {
  type: string; // e.g. "id_proof" | "insurance" | "report" | "other"
  label?: string;
  url: string;
  uploadedAt: Date;
}

export interface IHealthHistory {
  pastMedical?: string; // past medical history
  surgical?: string; // past surgical history
  medications?: string; // ongoing medications
  allergies?: string;
  familyHistory?: string;
}

export interface IPatientAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface IHospitalPatient {
  _id: Types.ObjectId;
  patientId: string; // unique, e.g. HWP-000123
  fullName: string;
  gender: "male" | "female" | "other";
  dateOfBirth?: Date;
  age?: number;
  bloodGroup?: string; // A+, A-, B+, B-, AB+, AB-, O+, O-, unknown
  phone: string;
  email?: string;
  address?: IPatientAddress;
  photo?: string; // patient photograph URL
  emergencyContacts: IEmergencyContact[];
  healthHistory: IHealthHistory;
  documents: IPatientDocument[];
  appUserId?: Types.ObjectId; // optional link to patient-app User
  registeredByAdminId: Types.ObjectId;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmergencyContactSchema = new Schema<IEmergencyContact>(
  {
    name: { type: String, required: true, trim: true },
    relation: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const PatientDocumentSchema = new Schema<IPatientDocument>(
  {
    type: { type: String, required: true, trim: true, default: "other" },
    label: { type: String, trim: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const HospitalPatientSchema = new Schema<IHospitalPatient>(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    fullName: { type: String, required: true, trim: true, index: true },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    dateOfBirth: Date,
    age: Number,
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
      default: "unknown",
    },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },
    photo: String,
    emergencyContacts: { type: [EmergencyContactSchema], default: [] },
    healthHistory: {
      pastMedical: { type: String, trim: true },
      surgical: { type: String, trim: true },
      medications: { type: String, trim: true },
      allergies: { type: String, trim: true },
      familyHistory: { type: String, trim: true },
    },
    documents: { type: [PatientDocumentSchema], default: [] },
    appUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    registeredByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Free-text search across the registration desk's primary lookup fields.
HospitalPatientSchema.index({ fullName: "text", patientId: "text", phone: "text" });

export const HospitalPatient = mongoose.model<IHospitalPatient>(
  "HospitalPatient",
  HospitalPatientSchema,
);

export default HospitalPatient;
