import mongoose, { Schema, Types } from "mongoose";

export interface ISmsSettings {
  _id: Types.ObjectId;
  provider: string; // SMS gateway provider (msg91, textlocal, etc.)
  apiKey: string;
  apiSecret: string;
  senderId: string; // Sender ID / Header (6-char DLT approved)
  entityId: string; // SmartPing DLT Entity ID (PE ID)
  contentTemplateId: string; // SmartPing Content Template ID
  templateId: string; // Provider-specific template ID
  baseUrl: string; // API base URL (for generic providers)
  enabled: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SmsSettingsSchema = new Schema<ISmsSettings>(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "twilio",
    },
    apiKey: { type: String, required: true, trim: true },
    apiSecret: { type: String, default: "" },
    senderId: { type: String, required: true, trim: true },
    entityId: { type: String, default: "", trim: true },
    contentTemplateId: { type: String, default: "", trim: true },
    templateId: { type: String, default: "", trim: true },
    baseUrl: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const SmsSettings = mongoose.model<ISmsSettings>(
  "SmsSettings",
  SmsSettingsSchema,
);
