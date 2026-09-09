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
  /** Last 10 digits of `phone` — see the schema note. */
  phoneKey?: string;
  email?: string;
  address?: IPatientAddress;
  photo?: string; // patient photograph URL
  emergencyContacts: IEmergencyContact[];
  healthHistory: IHealthHistory;
  documents: IPatientDocument[];
  appUserId?: Types.ObjectId; // optional link to patient-app User
  registeredByAdminId?: Types.ObjectId;
  // When a patient is registered from the field by an ambulance attendant
  // (not the admin desk), we record who and flag the source.
  registeredByStaffId?: Types.ObjectId;
  source: "admin" | "ambulance_staff" | "patient_app";
  isActive: boolean;
  isDeleted: boolean;
  // Set when this record was merged into another (duplicate cleanup) — the
  // record stays (soft-deleted, isActive:false) rather than being erased, so
  // anything that still points at its old id can be traced forward. See
  // hospital-patient.controller.ts#mergePatients.
  mergedIntoPatientId?: Types.ObjectId;
  mergedAt?: Date;
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
    /**
     * Last 10 digits of `phone`, kept in step by the hooks below.
     *
     * The patient app links to hospital records by matching the tail of the
     * mobile, which was done with a suffix regex (`/9876500011$/`). An index
     * can match a PREFIX, never a suffix, so that lookup scanned every patient
     * — on a path the portal hits constantly. Storing the normalised key turns
     * it into an indexed equality match.
     */
    phoneKey: { type: String, trim: true },
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
      // Optional: field registrations by ambulance staff have no admin.
    },
    registeredByStaffId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      index: true,
    },
    source: {
      type: String,
      enum: ["admin", "ambulance_staff", "patient_app"],
      default: "admin",
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    mergedIntoPatientId: { type: Schema.Types.ObjectId, ref: "HospitalPatient" },
    mergedAt: Date,
  },
  { timestamps: true },
);

// Free-text search across the registration desk's primary lookup fields.
HospitalPatientSchema.index({ fullName: "text", patientId: "text", phone: "text" });
// A text index cannot order a listing. The registry lists live patients
// newest-first, and duplicate detection groups by phone.
HospitalPatientSchema.index({ isDeleted: 1, createdAt: -1 });
HospitalPatientSchema.index({ isDeleted: 1, phone: 1 });
HospitalPatientSchema.index({ phoneKey: 1, isDeleted: 1 });

/** Last ten digits — the one definition both hooks and lookups use. */
export const toPhoneKey = (phone?: string): string =>
  String(phone || "").replace(/\D/g, "").slice(-10);

/**
 * Keep `phoneKey` in step with `phone` on every write path.
 *
 * Both hooks are needed: `save` covers documents created or edited in memory,
 * and the update hook covers `findOneAndUpdate`/`updateOne`, which never run
 * document middleware. Missing either one leaves records the patient portal
 * cannot find — a silent failure, since the lookup simply returns nothing.
 */
HospitalPatientSchema.pre("save", function (this: any) {
  if (this.isModified("phone") || !this.get("phoneKey")) {
    this.set("phoneKey", toPhoneKey(this.get("phone")));
  }
});

HospitalPatientSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"] as any,
  // Declared without a `next` callback on purpose: registered against several
  // hook names at once, mongoose invokes this with no arguments, so calling
  // `next()` threw on every update. Returning is the supported form.
  function (this: any) {
    const update = this.getUpdate() || {};
    const phone =
      update.phone ?? update.$set?.phone ?? update.$setOnInsert?.phone;
    if (phone === undefined) return;
    const phoneKey = toPhoneKey(phone);
    // Mongoose rejects an update that mixes bare fields with operators, so the
    // key has to go in whichever form the caller already used.
    if (update.phone !== undefined && !update.$set) {
      this.setUpdate({ ...update, phoneKey });
    } else {
      this.setUpdate({
        ...update,
        $set: { ...(update.$set || {}), phoneKey },
      });
    }
  },
);

export const HospitalPatient = mongoose.model<IHospitalPatient>(
  "HospitalPatient",
  HospitalPatientSchema,
);

export default HospitalPatient;
