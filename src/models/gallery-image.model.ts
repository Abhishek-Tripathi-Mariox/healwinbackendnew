import mongoose, { Schema, Types, Document } from "mongoose";

export interface IGalleryImage extends Document {
  _id: Types.ObjectId;
  title: string;
  image: string;
  images: string[];
  category: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GalleryImageSchema = new Schema<IGalleryImage>(
  {
    title: { type: String, required: true, trim: true },
    image: { type: String, default: "" },
    images: { type: [String], default: [] },
    category: { type: String, default: "General", trim: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

GalleryImageSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });
GalleryImageSchema.index({ isActive: 1, category: 1, sortOrder: 1 });

export const GalleryImage = mongoose.model<IGalleryImage>(
  "GalleryImage",
  GalleryImageSchema,
);
export default GalleryImage;
