import mongoose, { Schema, Types } from "mongoose";

export interface IEmergencyContact {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ISOSAlert {
  _id: Types.ObjectId;
  bookingId?: Types.ObjectId;
  userId?: Types.ObjectId;
  driverId?: Types.ObjectId;
  triggeredBy: "USER" | "DRIVER";
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  address?: string;
  status: "ACTIVE" | "RESPONDED" | "RESOLVED" | "FALSE_ALARM";
  respondedBy?: Types.ObjectId; // Admin ID
  respondedAt?: Date;
  resolvedAt?: Date;
  resolutionNotes?: string;
  contactsNotified: {
    contactId: Types.ObjectId;
    notifiedAt: Date;
    method: "SMS" | "CALL" | "PUSH";
  }[];
  policeNotified: boolean;
  policeNotifiedAt?: Date;
  audioRecordingUrl?: string;
  rejectedAmbulanceIds?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

// Emergency Contact Schema
const EmergencyContactSchema = new Schema<IEmergencyContact>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
    relationship: {
      type: String,
      required: true,
      enum: ["PARENT", "SPOUSE", "SIBLING", "FRIEND", "OTHER"],
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// SOS Alert Schema
const SOSAlertSchema = new Schema<ISOSAlert>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      index: true,
    },
    triggeredBy: {
      type: String,
      required: true,
      enum: ["USER", "DRIVER"],
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    address: String,
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "RESPONDED", "RESOLVED", "FALSE_ALARM"],
      default: "ACTIVE",
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    respondedAt: Date,
    resolvedAt: Date,
    resolutionNotes: String,
    contactsNotified: [
      {
        contactId: {
          type: Schema.Types.ObjectId,
          ref: "EmergencyContact",
        },
        notifiedAt: Date,
        method: {
          type: String,
          enum: ["SMS", "CALL", "PUSH"],
        },
      },
    ],
    policeNotified: {
      type: Boolean,
      default: false,
    },
    policeNotifiedAt: Date,
    audioRecordingUrl: String,
    rejectedAmbulanceIds: [{ type: Schema.Types.ObjectId, ref: "Ambulance" }],
  },
  {
    timestamps: true,
  },
);

// Indexes
EmergencyContactSchema.index({ userId: 1, isActive: 1 });
SOSAlertSchema.index({ location: "2dsphere" });
SOSAlertSchema.index({ status: 1, createdAt: -1 });

export const EmergencyContact = mongoose.model<IEmergencyContact>(
  "EmergencyContact",
  EmergencyContactSchema,
);

export const SOSAlert = mongoose.model<ISOSAlert>("SOSAlert", SOSAlertSchema);
