import mongoose, { Schema, Types } from "mongoose";

/**
 * Admin-managed first-aid / emergency education content shown in the patient
 * app (videos + quick guides). Marketing/medical team curates these without an
 * app release.
 */
export interface IFirstAidGuide {
  _id: Types.ObjectId;
  title: string;
  category?: string; // e.g. "CPR", "Bleeding", "Burns", "Choking"
  type: "video" | "article";
  videoUrl?: string; // YouTube/Vimeo/MP4 link (for type=video)
  thumbnailUrl?: string;
  content?: string; // article body / steps (for type=article)
  durationLabel?: string; // e.g. "3 min"
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FirstAidGuideSchema = new Schema<IFirstAidGuide>(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    type: { type: String, enum: ["video", "article"], default: "video" },
    videoUrl: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },
    content: { type: String, trim: true },
    durationLabel: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
FirstAidGuideSchema.index({ isActive: 1, isDeleted: 1, sortOrder: 1 });

export const FirstAidGuide = mongoose.model<IFirstAidGuide>("FirstAidGuide", FirstAidGuideSchema);
export default FirstAidGuide;
