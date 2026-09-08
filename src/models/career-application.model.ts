import mongoose, { Schema, Types } from "mongoose";

export type ApplicationStatus =
  | "NEW"
  | "IN_REVIEW"
  | "SHORTLISTED"
  | "INTERVIEW_SCHEDULED"
  | "OFFER_ACCEPTED"
  | "APPOINTED"
  | "ONHOLD"
  | "REJECTED"
  | "HIRED";

/** Online (video call) or in person at a Healwin centre. */
export type InterviewMode = "ONLINE" | "WALK_IN";

/**
 * A scheduled interview. Only ever one "current" interview per application —
 * rescheduling overwrites it, and every version is kept in `interviewHistory`
 * so HR can see what the candidate was told before.
 */
export interface IInterview {
  mode: InterviewMode;
  scheduledAt: Date;
  durationMinutes?: number;
  roundName?: string;
  /** ONLINE: the video-call link the candidate joins. */
  meetingLink?: string;
  /** WALK_IN: where to physically turn up. */
  venueName?: string;
  venueAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  /** Free text: what to bring, parking, dress code, panel names… */
  instructions?: string;
  scheduledByAdminId?: Types.ObjectId;
  scheduledAt_recordedAt?: Date;

  /* ── Post-interview evaluation (§9.3) ── */
  /** Panel's written assessment. */
  evaluationRemarks?: string;
  /** Out of 10, so candidates can be compared. */
  rating?: number;
  interviewerName?: string;
  /** Recommendation from the panel; the decision itself is the status. */
  recommendation?: "SELECT" | "REJECT" | "HOLD" | "NEXT_ROUND";
  hrReview?: string;
  managementReview?: string;
  evaluatedByAdminId?: Types.ObjectId;
  evaluatedAt?: Date;
}

/** What the candidate is being offered, and what goes on the offer letter. */
export interface IOffer {
  designation: string;
  department?: string;
  ctcAnnual: number;
  joiningDate: Date;
  location?: string;
  reportingTo?: string;
  /** Offer letter PDF archived to S3 — the same file the candidate received. */
  offerLetterUrl?: string;
  notes?: string;
  issuedByAdminId?: Types.ObjectId;
  issuedAt?: Date;

  /* ── Acceptance (§9.5) ── */
  /** Set when the candidate confirms; drives the appointment letter. */
  acceptedAt?: Date;
  /** Countersigned copy the candidate returned, archived to S3. */
  signedOfferUrl?: string;
  acceptanceNote?: string;
  declinedAt?: Date;
  declineReason?: string;
}

/**
 * Appointment letter — issued on the joining date, AFTER the offer has been
 * accepted. Kept separate from the offer so the two documents can carry
 * different dates and terms, which is how they work in practice.
 */
export interface IAppointment {
  issuedAt: Date;
  joiningDate: Date;
  designation: string;
  department?: string;
  reportingTo?: string;
  location?: string;
  appointmentLetterUrl?: string;
  /** The HR employee record created from this hire, when one has been made. */
  employeeId?: Types.ObjectId;
  issuedByAdminId?: Types.ObjectId;
}

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

  /* ── Hiring pipeline ── */
  interview?: IInterview | null;
  interviewHistory?: IInterview[];
  offer?: IOffer | null;
  appointment?: IAppointment | null;

  /**
   * Delivery state of the acknowledgement email.
   *
   * The application row is saved BEFORE any mail is attempted, so a mail
   * outage can never lose an application. What was missing was visibility:
   * a failed send only reached a console log, so nobody knew the candidate
   * was never acknowledged. Recorded here so the panel can show it and retry.
   */
  ackEmailStatus?: "pending" | "sent" | "failed";
  ackEmailError?: string;
  ackEmailAt?: Date;
  ackEmailAttempts?: number;

  /* ── Meta ── */
  status: ApplicationStatus;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InterviewSchema = new Schema<IInterview>(
  {
    mode: { type: String, enum: ["ONLINE", "WALK_IN"], required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30 },
    roundName: { type: String, trim: true },
    meetingLink: { type: String, trim: true },
    venueName: { type: String, trim: true },
    venueAddress: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    instructions: { type: String, trim: true },
    scheduledByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    scheduledAt_recordedAt: { type: Date, default: Date.now },
    evaluationRemarks: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 10 },
    interviewerName: { type: String, trim: true },
    recommendation: {
      type: String,
      enum: ["SELECT", "REJECT", "HOLD", "NEXT_ROUND"],
    },
    hrReview: { type: String, trim: true },
    managementReview: { type: String, trim: true },
    evaluatedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    evaluatedAt: Date,
  },
  { _id: false },
);

const OfferSchema = new Schema<IOffer>(
  {
    designation: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    ctcAnnual: { type: Number, required: true },
    joiningDate: { type: Date, required: true },
    location: { type: String, trim: true },
    reportingTo: { type: String, trim: true },
    offerLetterUrl: { type: String, trim: true },
    notes: { type: String, trim: true },
    issuedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    issuedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    signedOfferUrl: { type: String, trim: true },
    acceptanceNote: { type: String, trim: true },
    declinedAt: Date,
    declineReason: { type: String, trim: true },
  },
  { _id: false },
);

const AppointmentSchema = new Schema<IAppointment>(
  {
    issuedAt: { type: Date, default: Date.now },
    joiningDate: { type: Date, required: true },
    designation: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    reportingTo: { type: String, trim: true },
    location: { type: String, trim: true },
    appointmentLetterUrl: { type: String, trim: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "HrEmployee" },
    issuedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { _id: false },
);

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

    /* Hiring pipeline */
    interview: { type: InterviewSchema, default: null },
    interviewHistory: { type: [InterviewSchema], default: [] },
    offer: { type: OfferSchema, default: null },
    appointment: { type: AppointmentSchema, default: null },

    ackEmailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    ackEmailError: { type: String, trim: true },
    ackEmailAt: Date,
    ackEmailAttempts: { type: Number, default: 0 },

    /* Meta */
    status: {
      type: String,
      enum: [
        "NEW",
        "IN_REVIEW",
        "SHORTLISTED",
        "INTERVIEW_SCHEDULED",
        "OFFER_ACCEPTED",
        "APPOINTED",
        "ONHOLD",
        "REJECTED",
        "HIRED",
      ],
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
