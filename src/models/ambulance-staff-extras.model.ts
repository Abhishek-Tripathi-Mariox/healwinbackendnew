import mongoose, { Schema, Types } from "mongoose";

/**
 * Lightweight records backing the ambulance-staff app's Leave, Patient,
 * Case-notes and Stock-request screens. All scoped to the staff member who
 * created them.
 */

// ----- Leave -----
/**
 * @deprecated Leave is now centralized in `LeaveRequest`
 * (subjectType "ambulance_staff"). This model is READ-ONLY — kept only so
 * `scripts/migrate-staff-leaves.ts` can copy any pre-migration rows into the
 * central store. Nothing writes to it anymore; do not add new usages.
 */
export interface IStaffLeave {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  type: string; // Sick | Casual | ...
  fromDate: Date;
  toDate: Date;
  day: string; // 'Full Day' | 'Half Day'
  reason?: string;
  attachmentUrl?: string; // optional supporting doc (e.g. medical certificate)
  status: "Pending" | "Approved" | "Rejected";
  createdAt: Date;
  updatedAt: Date;
}
const StaffLeaveSchema = new Schema<IStaffLeave>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", required: true, index: true },
    type: { type: String, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    day: { type: String, default: "Full Day" },
    reason: String,
    attachmentUrl: String,
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  },
  { timestamps: true },
);
export const StaffLeave = mongoose.model<IStaffLeave>("StaffLeave", StaffLeaveSchema);

// NOTE: A `StaffPatient` model previously lived here but was unused — staff-
// registered patients are written straight to the HMS `HospitalPatient`
// collection (source: "ambulance_staff"), which `listStaffPatients` reads.
// Removed to avoid a dead, never-written model.

// ----- Case notes -----
export interface IStaffCaseNote {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  dispatchId?: Types.ObjectId | string;
  patientId?: Types.ObjectId | string;
  vitals?: Record<string, any>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
const StaffCaseNoteSchema = new Schema<IStaffCaseNote>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", required: true, index: true },
    dispatchId: { type: Schema.Types.Mixed },
    patientId: { type: Schema.Types.Mixed },
    vitals: { type: Schema.Types.Mixed },
    notes: String,
  },
  { timestamps: true },
);
export const StaffCaseNote = mongoose.model<IStaffCaseNote>("StaffCaseNote", StaffCaseNoteSchema);

// ----- Stock request -----
export interface IStaffStockRequest {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  items: { name: string; qty: number }[];
  status: "Pending" | "Fulfilled" | "Rejected";
  createdAt: Date;
  updatedAt: Date;
}
const StaffStockRequestSchema = new Schema<IStaffStockRequest>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", required: true, index: true },
    items: [{ name: String, qty: Number }],
    status: { type: String, enum: ["Pending", "Fulfilled", "Rejected"], default: "Pending" },
  },
  { timestamps: true },
);
export const StaffStockRequest = mongoose.model<IStaffStockRequest>(
  "StaffStockRequest",
  StaffStockRequestSchema,
);
