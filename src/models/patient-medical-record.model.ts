import mongoose, { Schema, Types } from "mongoose";

/**
 * Patient-app medical record. Belongs to the patient (userId); the uploaded
 * file lives under /uploads/medical-records and is referenced by `fileUrl`.
 * Replaces the earlier in-memory stub so records persist across restarts.
 */
export interface IPatientMedicalRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  type: string; // prescription | lab_report | scan | other
  familyMemberId?: Types.ObjectId | string | null;
  notes?: string;
  fileUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const PatientMedicalRecordSchema = new Schema<IPatientMedicalRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, default: "Untitled" },
    type: { type: String, default: "other" },
    familyMemberId: { type: Schema.Types.Mixed, default: null },
    notes: { type: String, trim: true },
    fileUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

export const PatientMedicalRecord = mongoose.model<IPatientMedicalRecord>(
  "PatientMedicalRecord",
  PatientMedicalRecordSchema,
);

export default PatientMedicalRecord;
