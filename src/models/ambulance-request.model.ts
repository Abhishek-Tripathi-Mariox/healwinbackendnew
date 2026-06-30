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
  amount?: number; // FINAL payable, i.e. grossAmount − discountAmount
  fareBreakdown?: Record<string, any>;
  // Promo applied at booking. grossAmount is the pre-discount fare; amount is
  // what the patient actually pays.
  grossAmount?: number;
  promoCodeId?: Types.ObjectId;
  promoCode?: string;
  discountAmount?: number;
  // In-transit medical expenses (oxygen, medicines, procedures) logged by the
  // control room/admin during the ride. Billed to the patient ON TOP of the
  // ambulance fare and shown as a separate "In-Transit Medical Expense" section.
  inTransitExpenses?: {
    inventoryItemId?: Types.ObjectId; // source HMS inventory item (if picked)
    item: string;
    qty: number;
    rate: number;
    amount: number;
  }[];
  inTransitTotal?: number; // sum of inTransitExpenses[].amount
  grandTotal?: number; // (amount ?? 0) + inTransitTotal — the final payable
  paymentStatus?: "PENDING" | "PAID";
  paidAt?: Date;
  paymentMethod?: string; // ONLINE | CASH | UPI | ...
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
  // The crew attendant riding along (notified + tracks the trip read-only).
  attendantStaffId?: Types.ObjectId;
  driverName?: string;
  driverPhone?: string;
  vehicleNumber?: string;
  etaMinutes?: number;
  otp?: string;
  assignedAt?: Date;
  completedAt?: Date;
  // Patient rating of the completed ride.
  rating?: number;
  review?: string;
  ratedAt?: Date;
  // Cancellation details — who cancelled, why, when, and any charge levied.
  cancelledBy?: "patient" | "admin" | "driver" | "system";
  cancelReason?: string;
  cancelledAt?: Date;
  cancellationCharge?: number;
  // Lifecycle timeline (Searching → Assigned → … → Completed/Cancelled), so the
  // booking detail can show "what happened" with who/when for each step.
  statusHistory?: {
    status: AmbulanceRequestStatus;
    at: Date;
    by?: "patient" | "admin" | "driver" | "system";
    note?: string;
  }[];
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
    grossAmount: Number,
    promoCodeId: { type: Schema.Types.ObjectId, ref: "PromoCode" },
    promoCode: String,
    discountAmount: { type: Number, default: 0 },
    inTransitExpenses: {
      type: [
        new Schema(
          {
            inventoryItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
            item: { type: String, required: true, trim: true },
            qty: { type: Number, required: true, min: 0 },
            rate: { type: Number, required: true, min: 0 },
            amount: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    inTransitTotal: { type: Number, default: 0 },
    grandTotal: { type: Number },
    paymentStatus: { type: String, enum: ["PENDING", "PAID"], default: "PENDING", index: true },
    paidAt: Date,
    paymentMethod: String,
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
    attendantStaffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff" },
    driverName: String,
    driverPhone: String,
    vehicleNumber: String,
    etaMinutes: Number,
    otp: String,
    assignedAt: Date,
    completedAt: Date,
    rating: { type: Number, min: 1, max: 5 },
    review: String,
    ratedAt: Date,
    cancelledBy: {
      type: String,
      enum: ["patient", "admin", "driver", "system"],
    },
    cancelReason: String,
    cancelledAt: Date,
    cancellationCharge: { type: Number, default: 0 },
    statusHistory: {
      type: [
        new Schema(
          {
            status: String,
            at: { type: Date, default: Date.now },
            by: String,
            note: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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
