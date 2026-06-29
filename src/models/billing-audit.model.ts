import mongoose, { Schema, Types } from "mongoose";

/**
 * Immutable audit trail for billing money-movements (payments, refunds,
 * advances, cancellations). Every refund/adjustment is logged here with who did
 * it, how much, the method, and a note — satisfying the "all refund records
 * must be audit-logged" requirement.
 */
export type BillingAuditAction =
  | "payment"
  | "refund"
  | "advance"
  | "cancellation_refund"
  | "cancel";

export interface IBillingAudit {
  _id: Types.ObjectId;
  invoiceId: Types.ObjectId;
  invoiceNo: string;
  patientId?: Types.ObjectId;
  action: BillingAuditAction;
  amount: number;
  method?: string;
  note?: string;
  byAdminId?: Types.ObjectId;
  createdAt: Date;
}

const BillingAuditSchema = new Schema<IBillingAudit>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: "HospitalInvoice", required: true, index: true },
    invoiceNo: { type: String, required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "HospitalPatient" },
    action: {
      type: String,
      enum: ["payment", "refund", "advance", "cancellation_refund", "cancel"],
      required: true,
      index: true,
    },
    amount: { type: Number, default: 0 },
    method: String,
    note: String,
    byAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
BillingAuditSchema.index({ invoiceId: 1, createdAt: -1 });
BillingAuditSchema.index({ action: 1, createdAt: -1 });

export const BillingAudit = mongoose.model<IBillingAudit>("BillingAudit", BillingAuditSchema);
export default BillingAudit;
