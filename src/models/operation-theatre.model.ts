import mongoose, { Schema, Types } from "mongoose";

/**
 * Operation Theatre (OT) module.
 *  - OperationTheatre: an OT room master (OT-1, Cardiac OT, …)
 *  - Surgery:          a scheduled surgery booking in an OT
 */

export interface IOperationTheatre {
  _id: Types.ObjectId;
  name: string;
  location?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const OperationTheatreSchema = new Schema<IOperationTheatre>(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
export const OperationTheatre = mongoose.model<IOperationTheatre>("OperationTheatre", OperationTheatreSchema);

export type SurgeryStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export interface ISurgery {
  _id: Types.ObjectId;
  otId: Types.ObjectId; // ref OperationTheatre
  patientId: Types.ObjectId; // ref HospitalPatient
  surgeonId?: Types.ObjectId; // ref Admin (Doctor role)
  procedureName: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: SurgeryStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
const SurgerySchema = new Schema<ISurgery>(
  {
    otId: { type: Schema.Types.ObjectId, ref: "OperationTheatre", required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: "HospitalPatient", required: true, index: true },
    surgeonId: { type: Schema.Types.ObjectId, ref: "Admin" },
    procedureName: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 60 },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
      default: "scheduled",
      index: true,
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
SurgerySchema.index({ otId: 1, scheduledAt: 1 });
export const Surgery = mongoose.model<ISurgery>("Surgery", SurgerySchema);
