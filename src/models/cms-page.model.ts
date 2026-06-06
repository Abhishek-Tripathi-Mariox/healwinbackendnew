import mongoose, { Schema, Types, Document } from "mongoose";

export interface ICmsPage extends Document {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  content: string; // Rich text HTML
  isActive: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CmsPageSchema = new Schema<ICmsPage>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// Note: slug already has unique: true which creates an index — no need for separate .index()

export const CmsPage = mongoose.model<ICmsPage>("CmsPage", CmsPageSchema);
export default CmsPage;
