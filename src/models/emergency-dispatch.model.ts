import mongoose, { Schema, Types } from "mongoose";

export interface IEmergencyDispatch {
  _id: Types.ObjectId;
  sosSubmission: Types.ObjectId; // Reference to SOSSubmission
  dispatchType:
    | "AMBULANCE"
    | "POLICE"
    | "FIRE_BRIGADE"
    | "EMERGENCY_CENTER"
    | "RESCUE_TEAM";
  // Target emergency service
  serviceName: string; // e.g. "City Hospital Ambulance", "Local Police Station"
  servicePhone: string;
  serviceAddress?: string;
  serviceLocation?: {
    type: "Point";
    coordinates: [number, number];
  };
  // Dispatch details
  dispatchedBy: Types.ObjectId; // Admin who dispatched
  dispatchedAt: Date;
  message?: string; // Note from admin
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  // Status tracking
  status:
    | "DISPATCHED"
    | "ACKNOWLEDGED"
    | "EN_ROUTE"
    | "ON_SCENE"
    | "ON_TRIP"
    | "COMPLETED"
    | "CANCELLED";
  patientUserId?: Types.ObjectId; // SOS patient (for notify + live tracking)
  patientName?: string; // denormalised for driver display (avoids a populate)
  pickupAddress?: string; // human-readable pickup, denormalised from the SOS
  otp?: string; // pickup verification code shown to the patient
  driverLocation?: { lat?: number; lng?: number };
  lastLocationAt?: Date;
  acknowledgedAt?: Date;
  arrivedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  // Response info
  responseNotes?: string;
  estimatedArrival?: number; // minutes
  ambulanceId?: Types.ObjectId;
  driverStaffId?: Types.ObjectId;
  attendantStaffId?: Types.ObjectId;
  patientLocation?: { type: "Point"; coordinates: [number, number] };
  roadDistanceKm?: number;
  etaMinutes?: number;
  acceptedAt?: Date;
  rejectedDispatches?: {
    ambulanceId: Types.ObjectId;
    rejectedAt: Date;
    reason?: string;
  }[];
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const EmergencyDispatchSchema = new Schema<IEmergencyDispatch>(
  {
    sosSubmission: {
      type: Schema.Types.ObjectId,
      ref: "SOSSubmission",
      required: true,
    },
    dispatchType: {
      type: String,
      required: true,
      enum: [
        "AMBULANCE",
        "POLICE",
        "FIRE_BRIGADE",
        "EMERGENCY_CENTER",
        "RESCUE_TEAM",
      ],
    },
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    servicePhone: {
      type: String,
      required: true,
      trim: true,
    },
    serviceAddress: {
      type: String,
      trim: true,
    },
    serviceLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
      },
    },
    dispatchedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    dispatchedAt: {
      type: Date,
      default: Date.now,
    },
    message: String,
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "HIGH",
    },
    status: {
      type: String,
      required: true,
      enum: [
        "DISPATCHED",
        "ACKNOWLEDGED",
        "EN_ROUTE",
        "ON_SCENE",
        "ON_TRIP",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "DISPATCHED",
    },
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    patientName: String,
    pickupAddress: String,
    otp: String,
    driverLocation: { lat: Number, lng: Number },
    lastLocationAt: Date,
    acknowledgedAt: Date,
    arrivedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    responseNotes: String,
    estimatedArrival: Number,
    ambulanceId: {
      type: Schema.Types.ObjectId,
      ref: "Ambulance",
      index: true,
    },
    driverStaffId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      index: true,
    },
    attendantStaffId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
    },
    patientLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: [Number],
    },
    roadDistanceKm: Number,
    etaMinutes: Number,
    acceptedAt: Date,
    rejectedDispatches: [
      {
        ambulanceId: { type: Schema.Types.ObjectId, ref: "Ambulance" },
        rejectedAt: Date,
        reason: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes
EmergencyDispatchSchema.index({ sosSubmission: 1 });
EmergencyDispatchSchema.index({ status: 1, dispatchedAt: -1 });
EmergencyDispatchSchema.index({ dispatchType: 1 });
EmergencyDispatchSchema.index({ dispatchedBy: 1 });
EmergencyDispatchSchema.index({ ambulanceId: 1, status: 1 });
EmergencyDispatchSchema.index({ driverStaffId: 1, status: 1 });
EmergencyDispatchSchema.index({ patientLocation: "2dsphere" });

export const EmergencyDispatch = mongoose.model<IEmergencyDispatch>(
  "EmergencyDispatch",
  EmergencyDispatchSchema,
);
