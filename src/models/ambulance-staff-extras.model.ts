import mongoose, { Schema, Types } from "mongoose";

/**
 * Lightweight records backing the ambulance-staff app's Leave, Patient,
 * Case-notes and Stock-request screens. All scoped to the staff member who
 * created them.
 */

// ----- Leave -----
export interface IStaffLeave {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  type: string; // Sick | Casual | ...
  fromDate: Date;
  toDate: Date;
  day: string; // 'Full Day' | 'Half Day'
  reason?: string;
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
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  },
  { timestamps: true },
);
export const StaffLeave = mongoose.model<IStaffLeave>("StaffLeave", StaffLeaveSchema);

// ----- Patient (staff-registered) -----
export interface IStaffPatient {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  name: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  pincode?: string;
  createdAt: Date;
  updatedAt: Date;
}
const StaffPatientSchema = new Schema<IStaffPatient>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff", required: true, index: true },
    name: { type: String, required: true },
    mobile: String,
    dob: String,
    gender: String,
    pincode: String,
  },
  { timestamps: true },
);
export const StaffPatient = mongoose.model<IStaffPatient>("StaffPatient", StaffPatientSchema);

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
