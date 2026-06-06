import mongoose, { Schema, Types } from "mongoose";

export interface INotification {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  driverId?: Types.ObjectId;
  staffId?: Types.ObjectId;
  title: string;
  body: string;
  type: "BOOKING" | "PAYMENT" | "PROMO" | "SYSTEM" | "CHAT" | "REWARD";
  data?: Record<string, any>;
  isRead: boolean;
  isSent: boolean;
  sentAt?: Date;
  readAt?: Date;
}

export interface IPushTemplate {
  _id: Types.ObjectId;
  name: string;
  code: string;
  title: string;
  body: string;
  type: "BOOKING" | "PAYMENT" | "PROMO" | "SYSTEM" | "CHAT" | "REWARD";
  variables: string[]; // e.g., ["userName", "bookingId"]
  isActive: boolean;
}

// Notification Schema
const NotificationSchema = new Schema<INotification>(
  {
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
    // Ambulance crew (driver/attendant) inbox owner. Distinct from the
    // legacy `driverId` which points at the ride-hailing Driver model.
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["BOOKING", "PAYMENT", "PROMO", "SYSTEM", "CHAT", "REWARD"],
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSent: {
      type: Boolean,
      default: false,
    },
    sentAt: Date,
    readAt: Date,
  },
  { timestamps: true },
);

// Push Template Schema
const PushTemplateSchema = new Schema<IPushTemplate>(
  {
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["BOOKING", "PAYMENT", "PROMO", "SYSTEM", "CHAT", "REWARD"],
      required: true,
    },
    variables: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Compound indexes
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ driverId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ staffId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema,
);
export const PushTemplate = mongoose.model<IPushTemplate>(
  "PushTemplate",
  PushTemplateSchema,
);
