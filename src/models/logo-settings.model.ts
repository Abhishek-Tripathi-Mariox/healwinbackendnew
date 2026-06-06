import mongoose, { Schema, Types } from "mongoose";

export interface ILogoSettings {
  _id: Types.ObjectId;
  titleLogo?: string;
  mainLogo?: string;
  sosDispatchNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LogoSettingsSchema = new Schema<ILogoSettings>(
  {
    titleLogo: { type: String, trim: true },
    mainLogo: { type: String, trim: true },
    sosDispatchNumber: { type: String, trim: true },
  },
  { timestamps: true },
);

export const LogoSettings = mongoose.model<ILogoSettings>(
  "LogoSettings",
  LogoSettingsSchema,
);
