import mongoose, { Schema, Types } from "mongoose";

/**
 * Patient-app ambulance request — the lightweight, real, persisted record
 * behind "Book Ambulance" / SOS-dispatch in the patient app.
 *
 * Lifecycle: SEARCHING → ASSIGNED → ARRIVED → ON_TRIP → COMPLETED (or CANCELLED).
 * The admin dispatch screen lists SEARCHING requests and assigns an ambulance +
 * driver; on assignment the backend emits a socket event + FCM push to the user
 * so the app flips from "Finding…" to live tracking.
 */

export type AmbulanceRequestStatus =
  | "SEARCHING"
  | "ASSIGNED"
  | "ARRIVED"
  | "ON_TRIP"
  | "COMPLETED"
  | "CANCELLED";

interface Loc {
  address?: string;
  lat?: number;
  lng?: number;
}

export interface IAmbulanceRequest {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type?: string; // BLS / ALS / etc. (display name, resolved from VehicleType)
  vehicleTypeId?: Types.ObjectId; // chosen VehicleType (fare source of truth)
  emergency: boolean;
  pickup: Loc;
  drop?: Loc;
  // Real fare, computed at booking time from the VehicleType + trip distance.
  distanceKm?: number;
  amount?: number;
  fareBreakdown?: Record<string, any>;
  patientName?: string;
  notes?: string;
  // "Book for someone else" — the saved contact this ride is for (parcel-style).
  // patientName mirrors the recipient's name for existing admin/driver display.
  contactId?: Types.ObjectId;
  // ...or a saved family member this ride is for (alternative to contactId).
  familyMemberId?: Types.ObjectId;
  recipientName?: string;
  recipientPhone?: string;
  status: AmbulanceRequestStatus;
  // Assignment
  ambulanceId?: Types.ObjectId;
  driverStaffId?: Types.ObjectId;
  driverName?: string;
  driverPhone?: string;
  vehicleNumber?: string;
  etaMinutes?: number;
  otp?: string;
  assignedAt?: Date;
  // Live ambulance position (pushed by the assigned driver/staff app).
  driverLocation?: Loc;
  lastLocationAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LocSchema = new Schema<Loc>(
  { address: String, lat: Number, lng: Number },
  { _id: false },
);

const AmbulanceRequestSchema = new Schema<IAmbulanceRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: String,
    vehicleTypeId: { type: Schema.Types.ObjectId, ref: "VehicleType" },
    emergency: { type: Boolean, default: false },
    pickup: { type: LocSchema, default: () => ({}) },
    drop: { type: LocSchema },
    distanceKm: Number,
    amount: Number,
    fareBreakdown: { type: Schema.Types.Mixed },
    patientName: String,
    notes: String,
    contactId: { type: Schema.Types.ObjectId, ref: "SavedContact" },
    familyMemberId: { type: Schema.Types.ObjectId, ref: "PatientFamilyMember" },
    recipientName: String,
    recipientPhone: String,
    status: {
      type: String,
      enum: ["SEARCHING", "ASSIGNED", "ARRIVED", "ON_TRIP", "COMPLETED", "CANCELLED"],
      default: "SEARCHING",
      index: true,
    },
    ambulanceId: { type: Schema.Types.ObjectId, ref: "Ambulance" },
    driverStaffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff" },
    driverName: String,
    driverPhone: String,
    vehicleNumber: String,
    etaMinutes: Number,
    otp: String,
    assignedAt: Date,
    driverLocation: { type: LocSchema },
    lastLocationAt: Date,
  },
  { timestamps: true },
);

AmbulanceRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const AmbulanceRequest = mongoose.model<IAmbulanceRequest>(
  "AmbulanceRequest",
  AmbulanceRequestSchema,
);
export default AmbulanceRequest;
