import mongoose, { Schema, Types, Document } from "mongoose";

export interface INewsArticle extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  image: string;
  images: string[];
  category: string;
  author: string;
  readTime: string;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: Date;
  sortOrder: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NewsArticleSchema = new Schema<INewsArticle>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, trim: true },
    excerpt: { type: String, default: "", trim: true },
    content: { type: String, default: "" },
    image: { type: String, default: "" },
    images: { type: [String], default: [] },
    category: { type: String, default: "General", trim: true },
    author: { type: String, default: "HealWin Team", trim: true },
    readTime: { type: String, default: "3 min read", trim: true },
    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: Date.now },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// Auto-generate slug from title
NewsArticleSchema.pre("validate", function () {
  if (this.title && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
});

// Ensure only one featured article
NewsArticleSchema.pre("save", async function () {
  if (this.isFeatured && this.isModified("isFeatured")) {
    await mongoose
      .model("NewsArticle")
      .updateMany({ _id: { $ne: this._id } }, { isFeatured: false });
  }
});

NewsArticleSchema.index({ isPublished: 1, isFeatured: -1, publishedAt: -1 });
NewsArticleSchema.index({ isPublished: 1, category: 1, publishedAt: -1 });

export const NewsArticle = mongoose.model<INewsArticle>(
  "NewsArticle",
  NewsArticleSchema,
);
export default NewsArticle;
