import mongoose, { Schema, Types, Document } from "mongoose";

export interface ICentreRequest extends Document {
  _id: Types.ObjectId;
  name: string;
  type: "healwin_operated" | "healwin_approved" | "other";
  address: string;
  state: string;
  district: string;
  division?: Types.ObjectId;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  phone: string;
  email: string;
  website: string;
  serviceTypes: Types.ObjectId[];
  departments: Types.ObjectId[];
  services: string[];
  rating: number;
  timings: string;
  image: string;
  info: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CentreRequestSchema = new Schema<ICentreRequest>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["healwin_operated", "healwin_approved", "other"],
      default: "other",
    },
    address: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
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
    contactPerson: { type: String, required: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    contactEmail: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CentreRequestSchema.index({ status: 1, createdAt: -1 });
CentreRequestSchema.index({ name: "text", address: "text", info: "text" });

export const CentreRequest = mongoose.model<ICentreRequest>(
  "CentreRequest",
  CentreRequestSchema,
);
export default CentreRequest;
