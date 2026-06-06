import mongoose, { Schema, Types } from "mongoose";

export interface ISupportTicket {
  _id: Types.ObjectId;
  ticketId: string;
  userId?: Types.ObjectId;
  driverId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  category: string;
  subcategory?: string;
  subject: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED" | "CLOSED";
  assignedTo?: Types.ObjectId;
  attachments: string[];
  resolution?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  lastMessageAt?: Date;
  rating?: number;
  feedback?: string;
}

export interface ISupportMessage {
  _id: Types.ObjectId;
  ticketId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: "USER" | "DRIVER" | "ADMIN" | "SYSTEM";
  message: string;
  attachments: string[];
  isRead: boolean;
}

// Support Ticket Schema
const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
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
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    subcategory: String,
    subject: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    attachments: [String],
    resolution: String,
    resolvedAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);

// Support Message Schema
const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    senderType: {
      type: String,
      enum: ["USER", "DRIVER", "ADMIN", "SYSTEM"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    attachments: [String],
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Compound indexes
SupportTicketSchema.index({ userId: 1, status: 1, createdAt: -1 });
SupportTicketSchema.index({ driverId: 1, status: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
SupportMessageSchema.index({ ticketId: 1, createdAt: 1 });

export const SupportTicket = mongoose.model<ISupportTicket>(
  "SupportTicket",
  SupportTicketSchema,
);
export const SupportMessage = mongoose.model<ISupportMessage>(
  "SupportMessage",
  SupportMessageSchema,
);
