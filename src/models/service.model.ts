import mongoose, { Schema, Types } from "mongoose";

export interface IServiceFeature {
  text: string;
  icon: string;
}

export interface IServiceStat {
  value: string;
  label: string;
}

export interface IServiceLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
  address?: string;
}

export interface IService {
  _id: Types.ObjectId;
  title: string;
  subtitle: string;
  slug: string;
  description: string;
  category?: Types.ObjectId; // ref to ServiceCategory
  image?: string;
  icon: string; // icon name e.g. "Ambulance", "Building2", etc.
  gradient: string; // e.g. "from-hw-sos to-red-600"
  lightGradient: string; // e.g. "from-red-50 to-rose-50"
  features: IServiceFeature[];
  stats: IServiceStat[];
  ctaText: string;
  ctaAction: "booking" | "location" | "link" | "contact" | "info";
  ctaLink?: string;
  location?: IServiceLocation;
  isPriority: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceFeatureSchema = new Schema<IServiceFeature>(
  {
    text: { type: String, required: true, trim: true },
    icon: { type: String, default: "CheckCircle", trim: true },
  },
  { _id: false },
);

const ServiceStatSchema = new Schema<IServiceStat>(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ServiceSchema = new Schema<IService>(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "ServiceCategory",
      default: null,
    },
    image: { type: String, trim: true },
    icon: { type: String, default: "Heart", trim: true },
    gradient: {
      type: String,
      default: "from-hw-primary to-hw-primary-dark",
      trim: true,
    },
    lightGradient: {
      type: String,
      default: "from-blue-50 to-indigo-50",
      trim: true,
    },
    features: { type: [ServiceFeatureSchema], default: [] },
    stats: { type: [ServiceStatSchema], default: [] },
    ctaText: { type: String, default: "Learn More", trim: true },
    ctaAction: {
      type: String,
      enum: ["booking", "location", "link", "contact", "info"],
      default: "info",
    },
    ctaLink: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
      address: { type: String, trim: true },
    },
    isPriority: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

ServiceSchema.index({ isActive: 1, sortOrder: 1 });
ServiceSchema.index({ location: "2dsphere" });

export const Service = mongoose.model<IService>("Service", ServiceSchema);
