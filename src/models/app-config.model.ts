import mongoose, { Schema, Types } from "mongoose";

export interface IAppConfig {
  _id: Types.ObjectId;
  key: string;
  value: any;
  type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON" | "ARRAY";
  category: string;
  description: string;
  isEditable: boolean;
}

export interface IFareConfig {
  _id: Types.ObjectId;
  name: string;
  gstPercentage: number;
  platformFeePercentage: number;
  insuranceFee: number;
  minimumFare: number;
  waitingChargePerMin: number;
  freeWaitingMinutes: number;
  nightSurgeMultiplier: number;
  nightSurgeStartHour: number;
  nightSurgeEndHour: number;
  rainSurgeMultiplier: number;
  peakHourSurgeMultiplier: number;
  peakHourStart: number;
  peakHourEnd: number;
  isActive: boolean;
}

export interface IServiceArea {
  _id: Types.ObjectId;
  name: string;
  district: string;
  state: string;
  coordinates: {
    type: string;
    coordinates: number[][][];
  };
  isActive: boolean;
  fareMultiplier: number;
}

// App Config Schema
const AppConfigSchema = new Schema<IAppConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    type: {
      type: String,
      enum: ["STRING", "NUMBER", "BOOLEAN", "JSON", "ARRAY"],
      default: "STRING",
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    isEditable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Fare Config Schema
const FareConfigSchema = new Schema<IFareConfig>(
  {
    name: {
      type: String,
      required: true,
      default: "default",
    },
    gstPercentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    platformFeePercentage: {
      type: Number,
      default: 10,
      min: 0,
      max: 50,
    },
    insuranceFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    minimumFare: {
      type: Number,
      default: 50,
      min: 0,
    },
    waitingChargePerMin: {
      type: Number,
      default: 2,
      min: 0,
    },
    freeWaitingMinutes: {
      type: Number,
      default: 10,
      min: 0,
    },
    nightSurgeMultiplier: {
      type: Number,
      default: 1.2,
      min: 1,
    },
    nightSurgeStartHour: {
      type: Number,
      default: 22, // 10 PM
    },
    nightSurgeEndHour: {
      type: Number,
      default: 6, // 6 AM
    },
    rainSurgeMultiplier: {
      type: Number,
      default: 1.3,
      min: 1,
    },
    peakHourSurgeMultiplier: {
      type: Number,
      default: 1.5,
      min: 1,
    },
    peakHourStart: {
      type: Number,
      default: 8, // 8 AM
    },
    peakHourEnd: {
      type: Number,
      default: 10, // 10 AM
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Service Area Schema
const ServiceAreaSchema = new Schema<IServiceArea>(
  {
    name: {
      type: String,
      required: true,
    },
    district: {
      type: String,
      required: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
    },
    coordinates: {
      type: {
        type: String,
        enum: ["Polygon"],
        required: true,
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    fareMultiplier: {
      type: Number,
      default: 1,
      min: 0.5,
    },
  },
  { timestamps: true },
);

// Create 2dsphere index for geospatial queries
ServiceAreaSchema.index({ coordinates: "2dsphere" });

export const AppConfig = mongoose.model<IAppConfig>(
  "AppConfig",
  AppConfigSchema,
);
export const FareConfig = mongoose.model<IFareConfig>(
  "FareConfig",
  FareConfigSchema,
);
export const ServiceArea = mongoose.model<IServiceArea>(
  "ServiceArea",
  ServiceAreaSchema,
);
