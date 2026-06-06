import mongoose, { Schema, Types, Document } from "mongoose";

export type LegalDocType = "ABOUT" | "PRIVACY" | "TERMS";
export type LegalAudience = "PATIENT" | "DRIVER";

export const LEGAL_DOC_TYPES: LegalDocType[] = ["ABOUT", "PRIVACY", "TERMS"];
export const LEGAL_AUDIENCES: LegalAudience[] = ["PATIENT", "DRIVER"];

/**
 * Editable legal/informational content shown inside the mobile apps.
 *
 * One row per (type, audience). The admin "Legal Content" page upserts
 * by that compound key so editors land on the same row every time they
 * pick a tab — there is no history table by design (kept tight: the
 * About page model has no history either, and adding one is easy if/when
 * compliance asks for it).
 *
 * `content` is stored as plain text. The apps render it inside a
 * Markdown-aware viewer so editors can add basic structure (headings,
 * bullets, links) without a rich-text editor on the admin side.
 */
export interface ILegalDocument extends Document {
  _id: Types.ObjectId;
  type: LegalDocType;
  audience: LegalAudience;
  title: string;
  content: string;
  version: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LegalDocumentSchema = new Schema<ILegalDocument>(
  {
    type: {
      type: String,
      enum: LEGAL_DOC_TYPES,
      required: true,
      index: true,
    },
    audience: {
      type: String,
      enum: LEGAL_AUDIENCES,
      required: true,
      index: true,
    },
    title: { type: String, default: "" },
    content: { type: String, default: "" },
    // Auto-incremented on every save so apps can decide whether to bust
    // a local cache or prompt the user to re-acknowledge a new T&C.
    version: { type: Number, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// One document per (type, audience). Upserts hit this unique key.
LegalDocumentSchema.index({ type: 1, audience: 1 }, { unique: true });

export const LegalDocument = mongoose.model<ILegalDocument>(
  "LegalDocument",
  LegalDocumentSchema,
);
export default LegalDocument;
