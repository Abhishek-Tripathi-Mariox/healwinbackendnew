import mongoose, { Schema, Types } from "mongoose";

export interface IAdminActivityLog {
  _id: Types.ObjectId;
  staffId: Types.ObjectId;
  staffName: string;
  staffEmail: string;
  action: string;
  module: string;
  method: string;
  path: string;
  ip?: string;
  userAgent?: string;
  requestBody?: Record<string, any>;
  responseStatus?: number;
  timeTaken?: number; // ms
  previousAction?: Types.ObjectId;
  timeSincePrevious?: number; // ms
  createdAt: Date;
  updatedAt: Date;
}

const AdminActivityLogSchema = new Schema<IAdminActivityLog>(
  {
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      required: true,
      index: true,
    },
    staffName: { type: String, required: true },
    staffEmail: { type: String, required: true },
    action: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true, index: true },
    method: { type: String, required: true, trim: true },
    path: { type: String, required: true, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    requestBody: { type: Schema.Types.Mixed },
    responseStatus: { type: Number },
    timeTaken: { type: Number },
    previousAction: { type: Schema.Types.ObjectId, ref: "AdminActivityLog" },
    timeSincePrevious: { type: Number },
  },
  { timestamps: true },
);

AdminActivityLogSchema.index({ createdAt: -1 });
AdminActivityLogSchema.index({ staffId: 1, createdAt: -1 });
AdminActivityLogSchema.index({ module: 1, createdAt: -1 });

export const AdminActivityLog = mongoose.model<IAdminActivityLog>(
  "AdminActivityLog",
  AdminActivityLogSchema,
);
