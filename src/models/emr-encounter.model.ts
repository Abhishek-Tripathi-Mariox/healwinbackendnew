import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — EMR (Electronic Medical Record).
 *
 * One document = one clinical encounter/visit for a patient, authored by a
 * doctor. Documentation is structured via the SOAP method:
 *   S — Subjective: what the patient reports
 *   O — Objective: measurable/observable findings (incl. vitals)
 *   A — Assessment: clinical interpretation / diagnoses
 *   P — Plan: next steps (follow-ups, preventive measures)
 *
 * Clinical orders (prescriptions, lab tests, imaging) are linked directly to
 * the encounter so a patient's record stays a single source of truth.
 */

export interface IPrescription {
  drug: string;
  // Set when the drug was picked from HMS inventory rather than typed free-hand.
  // Drives the pharmacy dispense + FEFO stock decrement.
  itemId?: Types.ObjectId;
  dosage?: string; // e.g. "500mg"
  frequency?: string; // e.g. "1-0-1"
  duration?: string; // e.g. "5 days"
  // "before food" / "after food" — part of a normal Indian Rx line.
  timing?: string;
  // Units to hand to the pharmacy. Derived from doses/day x days, editable.
  quantity?: number;
  notes?: string;
}

// A procedure performed during this encounter (dressing, suturing, minor
// surgery, catheterization, etc.) — feeds real line items into billing
// instead of a flat manually-typed amount. `price` is a snapshot of the
// catalog rate at the time it was picked (see Procedure model /
// catalog.controller.ts) so later rate changes don't retroactively alter
// an already-documented encounter; a free-text procedure not in the
// catalog can still be added with a manual price.
export interface IProcedureLine {
  name: string;
  price?: number;
  notes?: string;
}

export interface IVitals {
  bloodPressure?: string; // e.g. "120/80"
  pulse?: number; // bpm
  temperature?: number; // °F
  spo2?: number; // %
  respiratoryRate?: number; // breaths/min
  height?: number; // cm
  weight?: number; // kg
  bmi?: number;
}

export interface ISoap {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

// S — Subjective (reported by the patient).
export interface ISubjectiveDetail {
  symptoms?: string;
  duration?: string;
  painLevel?: number; // 0-10
  complaints?: string;
  lifestyle?: string;
}

// O — Objective (measured/observed). Vitals live in `vitals`; lab/imaging
// RESULTS live in DiagnosticOrder. Here: exam findings, device data, images.
export interface IObjectiveDetail {
  examFindings?: string;
  deviceData?: string; // e.g. ambulance monitor vitals captured in the field
}

export interface IAttachment {
  url: string;
  label?: string;
  kind?: "image" | "report" | "other";
  uploadedAt?: Date;
}

// A — Assessment. ICD code optional per diagnosis.
export interface IDiagnosis {
  code?: string; // ICD code (optional)
  text: string;
}

// P — referrals to another department/doctor.
export interface IReferral {
  department?: string;
  toDoctorId?: Types.ObjectId;
  reason?: string;
  urgency?: "routine" | "urgent" | "emergency";
}

export interface IEmrEncounter {
  _id: Types.ObjectId;
  patientId: Types.ObjectId; // ref HospitalPatient
  doctorId: Types.ObjectId; // ref Admin (user with Doctor role)
  encounterType: "OPD" | "IPD" | "consultation" | "emergency";
  visitDate: Date;
  chiefComplaint?: string;
  vitals: IVitals;
  soap: ISoap;
  // Structured SOAP detail (alongside the free-text soap for flexibility).
  subjectiveDetail?: ISubjectiveDetail;
  objectiveDetail?: IObjectiveDetail;
  attachments: IAttachment[]; // images / scanned reports on the encounter
  diagnoses: string[]; // legacy free-text diagnoses (kept for compatibility)
  icdDiagnoses: IDiagnosis[]; // structured diagnoses with optional ICD codes
  severity?: "mild" | "moderate" | "severe" | "critical";
  differentialDiagnoses: string[];
  treatmentPlan?: string;
  prescriptions: IPrescription[];
  procedures: IProcedureLine[];
  labOrders: string[];
  imagingOrders: string[];
  referrals: IReferral[];
  followUpAt?: Date;
  followUpNotes?: string;
  followUpAppointmentId?: Types.ObjectId; // appointment auto-created for follow-up
  admissionRecommended?: boolean;
  admissionNote?: string;
  notes?: string;
  // The doctor's plain-language takeaway — "what was advised" — mirroring
  // Consultation.summary from the patient-app consult flow.
  summary?: string;
  /** Set once this encounter's procedures have been billed. */
  proceduresInvoiceId?: Types.ObjectId;
  /**
   * Amendment trail. A finalized clinical note is a legal record — it is
   * amended, never silently rewritten. Each edit after finalisation appends
   * the previous values here with who changed them and why.
   */
  amendments?: {
    at: Date;
    byAdminId: Types.ObjectId;
    reason: string;
    changed: Record<string, any>;
  }[];
  status: "draft" | "finalized";
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionSchema = new Schema<IPrescription>(
  {
    drug: { type: String, required: true, trim: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    dosage: { type: String, trim: true },
    frequency: { type: String, trim: true },
    duration: { type: String, trim: true },
    timing: { type: String, trim: true },
    quantity: { type: Number, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const ProcedureLineSchema = new Schema<IProcedureLine>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const EmrEncounterSchema = new Schema<IEmrEncounter>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    encounterType: {
      type: String,
      enum: ["OPD", "IPD", "consultation", "emergency"],
      default: "OPD",
      index: true,
    },
    visitDate: { type: Date, default: Date.now, index: true },
    chiefComplaint: { type: String, trim: true },
    vitals: {
      bloodPressure: { type: String, trim: true },
      pulse: Number,
      temperature: Number,
      spo2: Number,
      respiratoryRate: Number,
      height: Number,
      weight: Number,
      bmi: Number,
    },
    soap: {
      subjective: { type: String, trim: true },
      objective: { type: String, trim: true },
      assessment: { type: String, trim: true },
      plan: { type: String, trim: true },
    },
    subjectiveDetail: {
      symptoms: { type: String, trim: true },
      duration: { type: String, trim: true },
      painLevel: { type: Number, min: 0, max: 10 },
      complaints: { type: String, trim: true },
      lifestyle: { type: String, trim: true },
    },
    objectiveDetail: {
      examFindings: { type: String, trim: true },
      deviceData: { type: String, trim: true },
    },
    attachments: {
      type: [
        new Schema<IAttachment>(
          {
            url: { type: String, required: true, trim: true },
            label: { type: String, trim: true },
            kind: { type: String, enum: ["image", "report", "other"], default: "image" },
            uploadedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    diagnoses: { type: [String], default: [] },
    icdDiagnoses: {
      type: [
        new Schema<IDiagnosis>(
          { code: { type: String, trim: true }, text: { type: String, required: true, trim: true } },
          { _id: false },
        ),
      ],
      default: [],
    },
    severity: { type: String, enum: ["mild", "moderate", "severe", "critical"] },
    differentialDiagnoses: { type: [String], default: [] },
    treatmentPlan: { type: String, trim: true },
    prescriptions: { type: [PrescriptionSchema], default: [] },
    procedures: { type: [ProcedureLineSchema], default: [] },
    labOrders: { type: [String], default: [] },
    imagingOrders: { type: [String], default: [] },
    referrals: {
      type: [
        new Schema<IReferral>(
          {
            department: { type: String, trim: true },
            toDoctorId: { type: Schema.Types.ObjectId, ref: "Admin" },
            reason: { type: String, trim: true },
            urgency: { type: String, enum: ["routine", "urgent", "emergency"], default: "routine" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    followUpAt: { type: Date },
    followUpNotes: { type: String, trim: true },
    followUpAppointmentId: { type: Schema.Types.ObjectId, ref: "Appointment" },
    admissionRecommended: { type: Boolean, default: false },
    admissionNote: { type: String, trim: true },
    notes: { type: String, trim: true },
    summary: { type: String, trim: true },
    proceduresInvoiceId: { type: Schema.Types.ObjectId, ref: "HospitalInvoice" },
    amendments: {
      type: [
        new Schema(
          {
            at: { type: Date, default: Date.now },
            byAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
            reason: { type: String, required: true, trim: true },
            changed: { type: Schema.Types.Mixed },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "finalized",
      index: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// Patient timeline: "all encounters for patient X, newest first".
EmrEncounterSchema.index({ patientId: 1, visitDate: -1 });

export const EmrEncounter = mongoose.model<IEmrEncounter>(
  "EmrEncounter",
  EmrEncounterSchema,
);

export default EmrEncounter;
