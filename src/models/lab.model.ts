import mongoose, { Schema, Types } from "mongoose";

/**
 * Diagnostic lab partner — onboarding + verified listing for the Lab Locator.
 *
 * Deliberately a mirror of the Pharmacy model (geo 2dsphere + state/district
 * filters + an onboarding `status` lifecycle): a lab can be submitted publicly
 * (pending) and an admin approves/rejects it. Only `approved` + `isActive` labs
 * surface on the public locator and in the patient app.
 *
 * NOT to be confused with `LabTest` — that is the catalogue of tests a patient
 * can order (CBC, Lipid Profile…). This is the physical facility that runs them.
 */

export interface ILab {
  _id: Types.ObjectId;
  name: string;
  ownerName?: string;
  licenseNumber?: string; // registration / NABL number
  address: string;
  state?: Types.ObjectId;
  district?: Types.ObjectId;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  phone: string;
  email?: string;
  is24x7: boolean;
  timings?: string;
  services: string[]; // e.g. "home sample collection", "radiology", "digital reports"
  image?: string;
  rating: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  source: "admin" | "public"; // how the listing was created
  isActive: boolean;
  isDeleted: boolean;
  createdByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LabSchema = new Schema<ILab>(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    state: { type: Schema.Types.ObjectId, ref: "State", index: true },
    district: { type: Schema.Types.ObjectId, ref: "District", index: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: undefined },
    },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    is24x7: { type: Boolean, default: false },
    timings: { type: String, trim: true },
    services: { type: [String], default: [] },
    image: { type: String, default: "" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    rejectionReason: { type: String, trim: true },
    source: { type: String, enum: ["admin", "public"], default: "admin" },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

LabSchema.index({ location: "2dsphere" });
LabSchema.index({ state: 1, district: 1, status: 1, isActive: 1 });
LabSchema.index({ name: "text", address: "text" });

export const Lab = mongoose.model<ILab>("Lab", LabSchema);

export default Lab;
