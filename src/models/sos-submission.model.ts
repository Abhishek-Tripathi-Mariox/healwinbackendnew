import mongoose, { Schema, Types } from "mongoose";

export interface ISOSSubmission {
  _id: Types.ObjectId;
  type: "CALL" | "FORM" | "APP_DOWNLOAD";
  userId?: Types.ObjectId; // the app patient who triggered it (for notify/track)
  // Common fields
  name: string;
  phone: string;
  email?: string;
  // Location
  location?: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  address?: string;
  // Form-specific fields
  emergencyType?: string;
  description?: string;
  numberOfPeople?: number;
  // Status tracking
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  respondedBy?: Types.ObjectId;
  respondedAt?: Date;
  resolvedAt?: Date;
  resolutionNotes?: string;
  // Metadata
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SOSSubmissionSchema = new Schema<ISOSSubmission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    type: {
      type: String,
      required: true,
      enum: ["CALL", "FORM", "APP_DOWNLOAD"],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
      },
    },
    address: String,
    emergencyType: {
      type: String,
      enum: [
        "MEDICAL",
        "ACCIDENT",
        "FIRE",
        "NATURAL_DISASTER",
        "VIOLENCE",
        "OTHER",
      ],
    },
    description: String,
    numberOfPeople: Number,
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      default: "PENDING",
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    respondedAt: Date,
    resolvedAt: Date,
    resolutionNotes: String,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  },
);

// Indexes
SOSSubmissionSchema.index({ type: 1, createdAt: -1 });
SOSSubmissionSchema.index({ status: 1, createdAt: -1 });
SOSSubmissionSchema.index({ location: "2dsphere" });
SOSSubmissionSchema.index({ phone: 1 });

export const SOSSubmission = mongoose.model<ISOSSubmission>(
  "SOSSubmission",
  SOSSubmissionSchema,
);
