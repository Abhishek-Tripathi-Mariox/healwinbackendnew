import mongoose, { Schema, Types } from "mongoose";

export interface IContent {
  _id: Types.ObjectId;
  type: "TERMS" | "PRIVACY" | "ABOUT" | "FAQ" | "REFUND" | "CANCELLATION";
  title: string;
  content: string;
  language: string;
  version: number;
  isActive: boolean;
  publishedAt?: Date;
  updatedBy?: Types.ObjectId;
}

export interface IFAQ {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  category: string;
  language: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ILanguage {
  _id: Types.ObjectId;
  code: string;
  name: string;
  nativeName: string;
  icon?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

// Content Schema
const ContentSchema = new Schema<IContent>(
  {
    type: {
      type: String,
      enum: ["TERMS", "PRIVACY", "ABOUT", "FAQ", "REFUND", "CANCELLATION"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      default: "en",
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    publishedAt: Date,
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true },
);

// FAQ Schema
const FAQSchema = new Schema<IFAQ>(
  {
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    language: {
      type: String,
      default: "en",
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Language Schema
const LanguageSchema = new Schema<ILanguage>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    nativeName: {
      type: String,
      required: true,
    },
    icon: String,
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Compound indexes
ContentSchema.index({ type: 1, language: 1, isActive: 1 });
FAQSchema.index({ category: 1, language: 1, isActive: 1 });

export const Content = mongoose.model<IContent>("Content", ContentSchema);
export const FAQ = mongoose.model<IFAQ>("FAQ", FAQSchema);
export const Language = mongoose.model<ILanguage>("Language", LanguageSchema);
