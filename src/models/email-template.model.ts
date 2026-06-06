import mongoose, { Schema, Types } from "mongoose";

export type EmailTemplateType =
  | "APPLICATION_ACKNOWLEDGEMENT"
  | "APPLICATION_STATUS_UPDATE"
  | "APPLICATION_STATUS_SHORTLISTED"
  | "APPLICATION_STATUS_HIRED"
  | "APPLICATION_STATUS_REJECTED"
  | "APPLICATION_HR_NOTIFICATION";

export interface IEmailTemplate {
  _id: Types.ObjectId;
  name: string;
  type: EmailTemplateType;
  subject: string;
  body: string; // HTML content with placeholders like {{candidateName}}, {{position}}, etc.
  isActive: boolean;
  placeholders: string[]; // List of available placeholders for reference
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "APPLICATION_ACKNOWLEDGEMENT",
        "APPLICATION_STATUS_UPDATE",
        "APPLICATION_STATUS_SHORTLISTED",
        "APPLICATION_STATUS_HIRED",
        "APPLICATION_STATUS_REJECTED",
        "APPLICATION_HR_NOTIFICATION",
      ],
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    placeholders: [{ type: String }],
  },
  { timestamps: true },
);

EmailTemplateSchema.index({ type: 1, isActive: 1 });

export const EmailTemplate = mongoose.model<IEmailTemplate>(
  "EmailTemplate",
  EmailTemplateSchema,
);
