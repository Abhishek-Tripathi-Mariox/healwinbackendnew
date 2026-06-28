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
  },
  { timestamps: true },
);
InsuranceClaimSchema.index({ createdAt: -1 });
export const InsuranceClaim = mongoose.model<IInsuranceClaim>("InsuranceClaim", InsuranceClaimSchema);
