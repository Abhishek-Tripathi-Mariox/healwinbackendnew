import mongoose, { Schema, Types } from "mongoose";

export interface ISOSSubmission {
  _id: Types.ObjectId;
  type: "CALL" | "FORM" | "APP_DOWNLOAD";
  userId?: Types.ObjectId; // the app patient who triggered it (for notify/track)
  // Common fields
  name: string;
  phone: string;
  /**
   * Who the raiser chose to alert besides the control room, and whether we
   * actually reached them.
   *
   * Recorded even when delivery failed: the control room needs to know that
   * "the son was supposed to be told and we could not reach him", so someone
   * can pick up the phone. A silent failure here is the worst outcome in an
   * emergency.
   */
  /**
   * False for a "tell my family, don't send an ambulance" alert. Such a row is
   * a record, NOT a job waiting for the control room — without this flag it
   * would sit in the dashboard looking like an unanswered emergency.
   */
  controlRoomAlerted?: boolean;
  notifiedContacts?: {
    familyMemberId?: Types.ObjectId;
    name?: string;
    phone?: string;
    relation?: string;
    channel: "push" | "none";
    delivered: boolean;
    note?: string;
  }[];
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
    controlRoomAlerted: { type: Boolean, default: true, index: true },
    notifiedContacts: {
      type: [
        new Schema(
          {
            familyMemberId: { type: Schema.Types.ObjectId, ref: "PatientFamilyMember" },
            name: String,
            phone: String,
            relation: String,
            channel: { type: String, enum: ["push", "none"], default: "none" },
            delivered: { type: Boolean, default: false },
            note: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    email: {
      type: String,
      trim: true,
    },
    // No default on `type` — otherwise Mongoose materialises an empty
    // { type: "Point" } (no coordinates) for location-less SOS, which the
    // 2dsphere index rejects ("Can't extract geo keys"). Unset = no location.
    location: {
      type: {
        type: String,
        enum: ["Point"],
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
