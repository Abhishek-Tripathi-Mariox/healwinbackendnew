import mongoose, { Schema, Types } from "mongoose";

export interface IOtp {
  _id: Types.ObjectId;
  identifier: string; // email or phone
  type: "email" | "phone";
  otp: string;
  verified: boolean;
  expiresAt: Date;
  lastSentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OtpSchema = new Schema<IOtp>(
  {
    identifier: { type: String, required: true, trim: true },
    type: { type: String, enum: ["email", "phone"], required: true },
    otp: { type: String, required: true },
    verified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

OtpSchema.index({ identifier: 1, type: 1 });
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = mongoose.model<IOtp>("Otp", OtpSchema);
