import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — EMR (Electronic Medical Record).
 *
 * One document = one clinical encounter/visit for a patient, authored by a
 * doctor. Documentation is structured via the SOAP method:
 *   S — Subjective: what the patient reports
 *   O — Objective: measurable/observable findings (incl. vitals)
 *   A — Assessment: clinical interpretation / diagnoses
 *   P — Plan: next steps (follow-ups, preventive measures)
 *
 * Clinical orders (prescriptions, lab tests, imaging) are linked directly to
 * the encounter so a patient's record stays a single source of truth.
 */

export interface IPrescription {
  drug: string;
  dosage?: string; // e.g. "500mg"
  frequency?: string; // e.g. "1-0-1"
  duration?: string; // e.g. "5 days"
  notes?: string;
}

export interface IVitals {
  bloodPressure?: string; // e.g. "120/80"
  pulse?: number; // bpm
  temperature?: number; // °F
  spo2?: number; // %
  respiratoryRate?: number; // breaths/min
  height?: number; // cm
  weight?: number; // kg
  bmi?: number;
}

export interface ISoap {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

export interface IEmrEncounter {
  _id: Types.ObjectId;
  patientId: Types.ObjectId; // ref HospitalPatient
  doctorId: Types.ObjectId; // ref Admin (user with Doctor role)
  encounterType: "OPD" | "IPD" | "consultation" | "emergency";
  visitDate: Date;
  chiefComplaint?: string;
  vitals: IVitals;
  soap: ISoap;
  diagnoses: string[];
  prescriptions: IPrescription[];
  labOrders: string[];
  imagingOrders: string[];
  notes?: string;
  status: "draft" | "finalized";
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionSchema = new Schema<IPrescription>(
  {
    drug: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true },
    frequency: { type: String, trim: true },
    duration: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const EmrEncounterSchema = new Schema<IEmrEncounter>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    encounterType: {
      type: String,
      enum: ["OPD", "IPD", "consultation", "emergency"],
      default: "OPD",
      index: true,
    },
    visitDate: { type: Date, default: Date.now, index: true },
    chiefComplaint: { type: String, trim: true },
    vitals: {
      bloodPressure: { type: String, trim: true },
      pulse: Number,
      temperature: Number,
      spo2: Number,
      respiratoryRate: Number,
      height: Number,
      weight: Number,
      bmi: Number,
    },
    soap: {
      subjective: { type: String, trim: true },
      objective: { type: String, trim: true },
      assessment: { type: String, trim: true },
      plan: { type: String, trim: true },
    },
    diagnoses: { type: [String], default: [] },
    prescriptions: { type: [PrescriptionSchema], default: [] },
    labOrders: { type: [String], default: [] },
    imagingOrders: { type: [String], default: [] },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "finalized",
      index: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// Patient timeline: "all encounters for patient X, newest first".
EmrEncounterSchema.index({ patientId: 1, visitDate: -1 });

export const EmrEncounter = mongoose.model<IEmrEncounter>(
  "EmrEncounter",
  EmrEncounterSchema,
);

export default EmrEncounter;
