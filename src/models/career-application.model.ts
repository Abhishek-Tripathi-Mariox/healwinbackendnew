import mongoose, { Schema, Types } from "mongoose";

export type ApplicationStatus =
  | "NEW"
  | "IN_REVIEW"
  | "SHORTLISTED"
  | "ONHOLD"
  | "REJECTED"
  | "HIRED";

export interface ICareerApplication {
  _id: Types.ObjectId;
  careerId: Types.ObjectId;
  applicationNumber: string;

  /* ── Personal Details ── */
  name: string;
  phone: string;
  email: string;
  dob: Date;
  gender: "Male" | "Female" | "Other";
  maritalStatus: "Single" | "Married";
  address: string;

  /* ── Position Info ── */
  department: string;
  position: string;

  /* ── Document URLs (S3) ── */
  resumeUrl?: string;
  passportPhotoUrl?: string;
  idProofUrl?: string;
  educationalCertificatesUrl?: string;
  professionalRegistrationUrl?: string;
  experienceCertificatesUrl?: string;
  otherDocumentsUrl?: string;

  /* ── Selected Locations ── */
  selectedStates: Types.ObjectId[];
  selectedDistricts: Types.ObjectId[];

  /* ── Declaration ── */
  declaration: boolean;

  /* ── Legacy (kept for old data) ── */
  experience?: string;
  coverLetter?: string;

  /* ── Meta ── */
  status: ApplicationStatus;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CareerApplicationSchema = new Schema<ICareerApplication>(
  {
    careerId: { type: Schema.Types.ObjectId, ref: "Career", required: true },
    applicationNumber: { type: String, unique: true, trim: true },

    /* Personal Details */
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    dob: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    maritalStatus: {
      type: String,
      enum: ["Single", "Married"],
    },
    address: { type: String, trim: true },

    /* Position Info */
    department: { type: String, trim: true },
    position: { type: String, trim: true },

    /* Document URLs */
    resumeUrl: { type: String, trim: true },
    passportPhotoUrl: { type: String, trim: true },
    idProofUrl: { type: String, trim: true },
    educationalCertificatesUrl: { type: String, trim: true },
    professionalRegistrationUrl: { type: String, trim: true },
    experienceCertificatesUrl: { type: String, trim: true },
    otherDocumentsUrl: { type: String, trim: true },

    /* Selected Locations */
    selectedStates: [{ type: Schema.Types.ObjectId, ref: "State" }],
    selectedDistricts: [{ type: Schema.Types.ObjectId, ref: "District" }],

    /* Declaration */
    declaration: { type: Boolean, default: false },

    /* Legacy */
    experience: { type: String, trim: true },
    coverLetter: { type: String, trim: true },

    /* Meta */
    status: {
      type: String,
      enum: ["NEW", "IN_REVIEW", "SHORTLISTED", "ONHOLD", "REJECTED", "HIRED"],
      default: "NEW",
      index: true,
    },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CareerApplicationSchema.index({ careerId: 1, appliedAt: -1 });
CareerApplicationSchema.index({ email: 1 });
// Note: applicationNumber already has unique: true which creates an index — no need for separate .index()

const APPLICATION_NUMBER_START = 10001;
const APPLICATION_PREFIX = "HWJA";

/**
 * Auto-generate application number before saving:
 * Format: YYYY-HWJA-NNNNN  (e.g. 2026-HWJA-10001)
 */
CareerApplicationSchema.pre("save", async function () {
  if (!this.applicationNumber) {
    const year = new Date().getFullYear();
    const prefix = `${year}-${APPLICATION_PREFIX}-`;

    const [lastApplication] = await mongoose
      .model<ICareerApplication>("CareerApplication")
      .aggregate([
        {
          $match: {
            applicationNumber: {
              $regex: `^${year}-${APPLICATION_PREFIX}-\\d+$`,
            },
          },
        },
        {
          $project: {
            numericPart: {
              $toInt: {
                $arrayElemAt: [{ $split: ["$applicationNumber", "-"] }, 2],
              },
            },
          },
        },
        { $sort: { numericPart: -1 } },
        { $limit: 1 },
      ]);

    const lastNumber = lastApplication?.numericPart ?? 0;
    const nextNumber =
      lastNumber >= APPLICATION_NUMBER_START
        ? lastNumber + 1
        : APPLICATION_NUMBER_START;

    this.applicationNumber = `${prefix}${nextNumber}`;
  }
});

export const CareerApplication = mongoose.model<ICareerApplication>(
  "CareerApplication",
  CareerApplicationSchema,
);
