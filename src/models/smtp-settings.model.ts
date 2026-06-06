import mongoose, { Schema, Types } from "mongoose";

export type SmtpPurpose = "NOTIFICATIONS" | "OTP";

export interface ISmtpSettings {
  _id: Types.ObjectId;
  purpose: SmtpPurpose;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  hrEmail: string;
  hrEmails: string[];
  acknowledgementCcEmails: string[];
  companyName: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SmtpSettingsSchema = new Schema<ISmtpSettings>(
  {
    purpose: {
      type: String,
      enum: ["NOTIFICATIONS", "OTP"],
      default: "NOTIFICATIONS",
      index: true,
    },
    host: { type: String, required: true, trim: true },
    port: { type: Number, required: true, default: 587 },
    secure: { type: Boolean, default: false },
    user: { type: String, required: true, trim: true },
    pass: { type: String, required: true },
    fromEmail: { type: String, required: true, trim: true, lowercase: true },
    fromName: { type: String, required: true, trim: true },
    hrEmail: { type: String, trim: true, lowercase: true, default: "" },
    hrEmails: [{ type: String, trim: true, lowercase: true }],
    acknowledgementCcEmails: [{ type: String, trim: true, lowercase: true }],
    companyName: { type: String, required: true, trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const SmtpSettings = mongoose.model<ISmtpSettings>(
  "SmtpSettings",
  SmtpSettingsSchema,
);
