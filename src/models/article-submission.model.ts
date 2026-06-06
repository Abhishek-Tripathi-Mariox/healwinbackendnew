import mongoose, { Schema, Types, Document } from "mongoose";

export interface IArticleSubmission extends Document {
  _id: Types.ObjectId;
  submissionType: "article" | "gallery";
  title: string;
  content: string;
  authorName: string;
  authorEmail: string;
  attachments: {
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
  }[];
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  // Set once the submission is published into News / Gallery on approval.
  // Used to make publishing idempotent (re-approving won't create duplicates).
  publishedRefId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ArticleSubmissionSchema = new Schema<IArticleSubmission>(
  {
    submissionType: {
      type: String,
      enum: ["article", "gallery"],
      default: "article",
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: "" },
    authorName: { type: String, required: true, trim: true },
    authorEmail: { type: String, required: true, trim: true, lowercase: true },
    attachments: [
      {
        url: { type: String, required: true, trim: true },
        originalName: { type: String, required: true, trim: true },
        mimeType: { type: String, required: true, trim: true },
        size: { type: Number, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewNote: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: { type: Date },
    publishedRefId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

export const ArticleSubmission = mongoose.model<IArticleSubmission>(
  "ArticleSubmission",
  ArticleSubmissionSchema,
);
export default ArticleSubmission;
