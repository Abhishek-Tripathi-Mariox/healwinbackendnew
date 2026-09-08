import mongoose, { Schema, Types } from "mongoose";

/**
 * Hospital insurance / TPA module.
 *  - InsurancePayer:   the insurer or TPA master (Star Health, MediAssist, …)
 *  - PatientPolicy:    a patient's policy with a payer (links HospitalPatient)
 *  - InsuranceClaim:   a claim raised against a policy, optionally for an invoice
 */

// ----- Payer (insurer / TPA) -----
export interface IInsurancePayer {
  _id: Types.ObjectId;
  name: string;
  type: "insurer" | "tpa";
  code?: string;
  contactPhone?: string;
  contactEmail?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const InsurancePayerSchema = new Schema<IInsurancePayer>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["insurer", "tpa"], default: "insurer" },
    code: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
export const InsurancePayer = mongoose.model<IInsurancePayer>("InsurancePayer", InsurancePayerSchema);

/**
 * Two different pieces of paper, and they are not interchangeable:
 *
 *  • `policy` — the policy document or schedule. It carries the policy number,
 *    the sum insured and the validity dates, which is what billing verifies
 *    against. REQUIRED when a policy is registered.
 *  • `card`   — the cashless/TPA card. Handy at the desk, but it does not
 *    prove the cover, so it stays optional.
 */
export type PolicyDocumentKind = "policy" | "card" | "other";

export interface IPolicyDocument {
  _id?: Types.ObjectId;
  kind: PolicyDocumentKind;
  name: string;
  url: string;
  mimeType?: string;
  uploadedAt: Date;
}

const PolicyDocumentSchema = new Schema<IPolicyDocument>(
  {
    kind: {
      type: String,
      enum: ["policy", "card", "other"],
      default: "other",
    },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    mimeType: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/**
 * A policy is not spendable until someone has checked it.
 *
 * Patients self-register policies from the app, so the number and the cover
 * are claims made by the patient until billing staff verify them against the
 * card. Money can only be deducted from an `approved` policy — that gate is
 * why the card upload itself is optional: the approver decides what evidence
 * they need, rather than the form blocking submission.
 */
export type PolicyApproval = "pending" | "approved" | "rejected";

// ----- Patient policy -----
export interface IPatientPolicy {
  _id: Types.ObjectId;
  patientId: Types.ObjectId; // ref HospitalPatient
  payerId: Types.ObjectId; // ref InsurancePayer
  policyNumber: string;
  holderName?: string;
  sumInsured?: number;
  validFrom?: Date;
  validTo?: Date;
  documents: IPolicyDocument[];
  approvalStatus: PolicyApproval;
  approvedByAdminId?: Types.ObjectId;
  approvedAt?: Date;
  /** Why it was rejected — shown to the patient in the app. */
  reviewNote?: string;
  /** Where the policy came from, so staff know what they are verifying. */
  source: "patient" | "staff";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const PatientPolicySchema = new Schema<IPatientPolicy>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "HospitalPatient", required: true, index: true },
    payerId: { type: Schema.Types.ObjectId, ref: "InsurancePayer", required: true },
    policyNumber: { type: String, required: true, trim: true },
    holderName: { type: String, trim: true },
    sumInsured: { type: Number, default: 0 },
    validFrom: Date,
    validTo: Date,
    // Required in the API rather than the schema: existing policies predate
    // this field and must not become unsaveable, but nothing new gets in
    // without proof.
    documents: { type: [PolicyDocumentSchema], default: [] },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      // Staff-entered policies are trusted; the default here covers the
      // patient-submitted path, which is the one that needs checking.
      default: "pending",
      index: true,
    },
    approvedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    approvedAt: Date,
    reviewNote: { type: String, trim: true },
    source: { type: String, enum: ["patient", "staff"], default: "patient" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
PatientPolicySchema.index({ patientId: 1, isActive: 1 });
export const PatientPolicy = mongoose.model<IPatientPolicy>("PatientPolicy", PatientPolicySchema);

// ----- Claim -----
export type ClaimStatus = "draft" | "submitted" | "approved" | "rejected" | "settled";
export interface IInsuranceClaim {
  _id: Types.ObjectId;
  claimNumber: string; // auto e.g. CLM-000123
  patientId: Types.ObjectId; // ref HospitalPatient
  policyId: Types.ObjectId; // ref PatientPolicy
  payerId: Types.ObjectId; // ref InsurancePayer (denormalised)
  invoiceId?: Types.ObjectId; // ref HospitalInvoice
  claimedAmount: number;
  approvedAmount: number;
  status: ClaimStatus;
  notes?: string;
  submittedAt?: Date;
  settledAt?: Date;
  /**
   * When this claim's amount was posted onto the linked invoice as a payment.
   *
   * A claim reaches the invoice by one of two routes: the billing desk pays a
   * bill FROM insurance (the payment and the claim are created together), or a
   * claim raised earlier is later marked settled. Both must post exactly once
   * — without this marker, paying from insurance and then settling the same
   * claim credited the invoice twice.
   */
  postedToInvoiceAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const InsuranceClaimSchema = new Schema<IInsuranceClaim>(
  {
    claimNumber: { type: String, required: true, unique: true },
    patientId: { type: Schema.Types.ObjectId, ref: "HospitalPatient", required: true, index: true },
    policyId: { type: Schema.Types.ObjectId, ref: "PatientPolicy", required: true },
    payerId: { type: Schema.Types.ObjectId, ref: "InsurancePayer", required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "HospitalInvoice" },
    claimedAmount: { type: Number, default: 0 },
    approvedAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected", "settled"],
      default: "draft",
      index: true,
    },
    notes: { type: String, trim: true },
    submittedAt: Date,
    settledAt: Date,
    postedToInvoiceAt: Date,
  },
  { timestamps: true },
);
InsuranceClaimSchema.index({ createdAt: -1 });
export const InsuranceClaim = mongoose.model<IInsuranceClaim>("InsuranceClaim", InsuranceClaimSchema);
