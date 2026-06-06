import mongoose, { Schema, Types, Document } from "mongoose";

export interface ICentre extends Document {
  _id: Types.ObjectId;
  name: string;
  type: "healwin_operated" | "healwin_approved" | "other";
  address: string;
  state: Types.ObjectId;
  district: Types.ObjectId;
  division?: Types.ObjectId;
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  phone: string;
  email: string;
  website: string;
  serviceTypes: Types.ObjectId[];
  departments: Types.ObjectId[];
  services: string[]; // Tags like "Emergency", "ICU", "OPD"
  rating: number;
  timings: string;
  image: string;
  info: string; // Additional info / description
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CentreSchema = new Schema<ICentre>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["healwin_operated", "healwin_approved", "other"],
      required: true,
    },
    address: { type: String, required: true, trim: true },
    state: { type: Schema.Types.ObjectId, ref: "State", required: true },
    district: { type: Schema.Types.ObjectId, ref: "District", required: true },
    division: { type: Schema.Types.ObjectId, ref: "Division" },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    website: { type: String, default: "", trim: true },
    serviceTypes: [{ type: Schema.Types.ObjectId, ref: "LocatorServiceType" }],
    departments: [{ type: Schema.Types.ObjectId, ref: "Department" }],
    services: [{ type: String, trim: true }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    timings: { type: String, default: "", trim: true },
    image: { type: String, default: "" },
    info: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CentreSchema.index({ location: "2dsphere" });
CentreSchema.index({ state: 1, district: 1, type: 1, isActive: 1 });
CentreSchema.index({ serviceTypes: 1 });
CentreSchema.index({ name: "text", address: "text", info: "text" });

export const Centre = mongoose.model<ICentre>("Centre", CentreSchema);
export default Centre;
