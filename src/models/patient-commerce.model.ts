import mongoose, { Schema, Types } from "mongoose";

/**
 * Patient-app commerce records — real, persisted orders/bookings behind the
 * Pharmacy, Lab and Doctor-consultation flows. Previously these endpoints were
 * stubs that returned `{ _id: "stub" }` and never saved anything; these models
 * make them round-trip (place → list → detail) and give the admin a real
 * inbox to fulfil.
 */

// ---------------- Pharmacy order ----------------
interface PharmacyOrderItem {
  productId?: Types.ObjectId;
  name: string;
  price: number;
  qty: number;
}

export interface IPharmacyOrder {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  items: PharmacyOrderItem[];
  addressId?: Types.ObjectId;
  prescriptionUrl?: string;
  totalAmount: number;
  status: "PLACED" | "CONFIRMED" | "PACKED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

const PharmacyOrderSchema = new Schema<IPharmacyOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: "PharmacyProduct" },
        name: String,
        price: { type: Number, default: 0 },
        qty: { type: Number, default: 1 },
      },
    ],
    addressId: { type: Schema.Types.ObjectId, ref: "UserAddress" },
    prescriptionUrl: String,
    totalAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PLACED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
      default: "PLACED",
      index: true,
    },
  },
  { timestamps: true },
);
PharmacyOrderSchema.index({ userId: 1, createdAt: -1 });
export const PharmacyOrder = mongoose.model<IPharmacyOrder>("PharmacyOrder", PharmacyOrderSchema);

// ---------------- Lab booking ----------------
interface LabBookingTest {
  testId?: Types.ObjectId;
  name: string;
  price: number;
}

export interface ILabBooking {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tests: LabBookingTest[];
  addressId?: Types.ObjectId;
  familyMemberId?: Types.ObjectId;
  slot?: string;
  // Scheduled sample-collection appointment.
  scheduledAt?: Date;
  slotTime?: string; // "09:30" (IST 24h)
  slotLabel?: string; // "9:30 AM, 18 Jun"
  totalAmount: number;
  status: "BOOKED" | "SAMPLE_COLLECTED" | "PROCESSING" | "REPORT_READY" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

const LabBookingSchema = new Schema<ILabBooking>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tests: [
      {
        _id: false,
        testId: { type: Schema.Types.ObjectId, ref: "LabTest" },
        name: String,
        price: { type: Number, default: 0 },
      },
    ],
    addressId: { type: Schema.Types.ObjectId, ref: "UserAddress" },
    familyMemberId: { type: Schema.Types.ObjectId, ref: "PatientFamilyMember" },
    slot: String,
    scheduledAt: Date,
    slotTime: String,
    slotLabel: String,
    totalAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["BOOKED", "SAMPLE_COLLECTED", "PROCESSING", "REPORT_READY", "CANCELLED"],
      default: "BOOKED",
      index: true,
    },
  },
  { timestamps: true },
);
LabBookingSchema.index({ userId: 1, createdAt: -1 });
export const LabBooking = mongoose.model<ILabBooking>("LabBooking", LabBookingSchema);

// ---------------- Doctor consultation ----------------
export interface IConsultation {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  doctorId: Types.ObjectId;
  doctorName?: string;
  speciality?: string;
  familyMemberId?: Types.ObjectId;
  slotId?: string;
  // Scheduled appointment time.
  scheduledAt?: Date;
  slotTime?: string; // "09:30" (IST 24h)
  slotLabel?: string; // "9:30 AM, 18 Jun"
  symptoms?: string;
  teleconsult: boolean;
  fee: number;
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

const ConsultationSchema = new Schema<IConsultation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    doctorName: String,
    speciality: String,
    familyMemberId: { type: Schema.Types.ObjectId, ref: "PatientFamilyMember" },
    slotId: String,
    scheduledAt: Date,
    slotTime: String,
    slotLabel: String,
    symptoms: String,
    teleconsult: { type: Boolean, default: true },
    fee: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"],
      default: "REQUESTED",
      index: true,
    },
  },
  { timestamps: true },
);
ConsultationSchema.index({ userId: 1, createdAt: -1 });
export const Consultation = mongoose.model<IConsultation>("Consultation", ConsultationSchema);
