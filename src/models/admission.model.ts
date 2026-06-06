import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — IPD admission.
 *
 * One document = one inpatient stay. It carries the live bed assignment, a
 * transfer history, and per-stay clinical logs (vitals, medication
 * administration, progress notes / rounds) plus a discharge summary. Bed
 * occupancy is kept in sync by the admission controller.
 */

export interface IBedAssignment {
  ward: string;
  bedNumber: string;
  bedId?: Types.ObjectId;
  fromAt: Date;
  toAt?: Date; // set when transferred out of this bed
}

export interface IVitalLog {
  at: Date;
  bloodPressure?: string;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  respiratoryRate?: number;
  recordedByAdminId: Types.ObjectId;
}

export interface IMedicationLog {
  at: Date;
  drug: string;
  dose?: string;
  route?: string;
  administeredByAdminId: Types.ObjectId;
  notes?: string;
}

export interface IProgressNote {
  at: Date;
  note: string;
  authorAdminId: Types.ObjectId;
}

export interface IAdmission {
  _id: Types.ObjectId;
  admissionNo: string; // e.g. IPD-000123
  patientId: Types.ObjectId;
  attendingDoctorId: Types.ObjectId;
  admittedAt: Date;
  reason?: string;
  status: "admitted" | "discharged";
  currentBedId?: Types.ObjectId | null;
  currentWard?: string;
  currentBedNumber?: string;
  bedHistory: IBedAssignment[];
  carePlan?: string;
  vitalsLog: IVitalLog[];
  medicationLog: IMedicationLog[];
  progressNotes: IProgressNote[];
  dischargedAt?: Date;
  dischargeSummary?: string;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BedAssignmentSchema = new Schema<IBedAssignment>(
  {
    ward: { type: String, required: true },
    bedNumber: { type: String, required: true },
    bedId: { type: Schema.Types.ObjectId, ref: "Bed" },
    fromAt: { type: Date, default: Date.now },
    toAt: Date,
  },
  { _id: false },
);

const VitalLogSchema = new Schema<IVitalLog>(
  {
    at: { type: Date, default: Date.now },
    bloodPressure: String,
    pulse: Number,
    temperature: Number,
    spo2: Number,
    respiratoryRate: Number,
    recordedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { _id: false },
);

const MedicationLogSchema = new Schema<IMedicationLog>(
  {
    at: { type: Date, default: Date.now },
    drug: { type: String, required: true },
    dose: String,
    route: String,
    administeredByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    notes: String,
  },
  { _id: false },
);

const ProgressNoteSchema = new Schema<IProgressNote>(
  {
    at: { type: Date, default: Date.now },
    note: { type: String, required: true },
    authorAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { _id: false },
);

const AdmissionSchema = new Schema<IAdmission>(
  {
    admissionNo: { type: String, required: true, unique: true, trim: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    attendingDoctorId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    admittedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["admitted", "discharged"],
      default: "admitted",
      index: true,
    },
    currentBedId: { type: Schema.Types.ObjectId, ref: "Bed", default: null },
    currentWard: String,
    currentBedNumber: String,
    bedHistory: { type: [BedAssignmentSchema], default: [] },
    carePlan: { type: String, trim: true },
    vitalsLog: { type: [VitalLogSchema], default: [] },
    medicationLog: { type: [MedicationLogSchema], default: [] },
    progressNotes: { type: [ProgressNoteSchema], default: [] },
    dischargedAt: Date,
    dischargeSummary: { type: String, trim: true },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

AdmissionSchema.index({ status: 1, admittedAt: -1 });

export const Admission = mongoose.model<IAdmission>(
  "Admission",
  AdmissionSchema,
);

export default Admission;
