import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Lab & Radiology diagnostic orders WITH results.
 *
 * Closes the gap where EMR/IPD could only record lab/imaging *orders* as
 * free text but never their *results/reports*. One document = one ordered
 * test/study for a patient, carried through its lifecycle:
 *   ordered → collected (sample taken / patient sent) → reported (result in)
 *
 * Results can be a typed value/notes and/or uploaded report files (PDF/image).
 * Linked to the patient (always) and optionally to the EMR encounter that
 * raised it, so the record stays a single source of truth.
 */

export interface IDiagnosticAttachment {
  url: string;
  label: string;
  uploadedAt: Date;
}

export interface IDiagnosticOrder {
  _id: Types.ObjectId;
  patientId: Types.ObjectId; // ref HospitalPatient
  encounterId?: Types.ObjectId; // ref EmrEncounter (if raised in a consult)
  admissionId?: Types.ObjectId; // ref Admission (if raised during IPD stay)
  category: "lab" | "imaging";
  name: string; // e.g. "CBC", "Chest X-Ray"
  status: "ordered" | "collected" | "reported";
  resultValue?: string; // e.g. "Hb 13.2 g/dL" or free-text findings
  resultNotes?: string;
  attachments: IDiagnosticAttachment[];
  orderedByAdminId: Types.ObjectId;
  orderedAt: Date;
  reportedByAdminId?: Types.ObjectId;
  reportedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IDiagnosticAttachment>(
  {
    url: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const DiagnosticOrderSchema = new Schema<IDiagnosticOrder>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    encounterId: { type: Schema.Types.ObjectId, ref: "EmrEncounter" },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    category: {
      type: String,
      enum: ["lab", "imaging"],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["ordered", "collected", "reported"],
      default: "ordered",
      index: true,
    },
    resultValue: { type: String, trim: true },
    resultNotes: { type: String, trim: true },
    attachments: { type: [AttachmentSchema], default: [] },
    orderedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    orderedAt: { type: Date, default: Date.now },
    reportedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    reportedAt: { type: Date },
  },
  { timestamps: true },
);

// Patient timeline: "all diagnostics for patient X, newest first".
DiagnosticOrderSchema.index({ patientId: 1, createdAt: -1 });

export const DiagnosticOrder = mongoose.model<IDiagnosticOrder>(
  "DiagnosticOrder",
  DiagnosticOrderSchema,
);

export default DiagnosticOrder;
