import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Hospital billing invoice.
 *
 * Distinct from the ambulance `Invoice` model (which bills ride fares). Covers
 * OPD and IPD hospital services. The total is broken into sections
 * (consultation, procedure, room/bed, pharmacy, diagnostics, other) via line
 * items. Payments are appended to `payments[]`; `amountPaid`/`balanceDue` are
 * recomputed on every mutation so financial reports stay cheap.
 */

export type BillingSection =
  | "consultation"
  | "procedure"
  | "room"
  | "pharmacy"
  | "diagnostics"
  | "other";

export type PaymentMethod = "cash" | "card" | "upi" | "insurance" | "wallet";

export interface IInvoiceLineItem {
  section: BillingSection;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface IInvoicePayment {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  paidAt: Date;
  recordedByAdminId: Types.ObjectId;
  isRefund?: boolean;
}

export interface IHospitalInvoice {
  _id: Types.ObjectId;
  invoiceNo: string; // e.g. INV-000123
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId;
  lineItems: IInvoiceLineItem[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  cgstAmount: number; // intra-state GST split (CGST = SGST = taxAmount / 2)
  sgstAmount: number;
  gstin?: string; // hospital GSTIN shown on the invoice
  discount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: "draft" | "unpaid" | "partial" | "paid" | "refunded" | "cancelled";
  payments: IInvoicePayment[];
  notes?: string;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LineItemSchema = new Schema<IInvoiceLineItem>(
  {
    section: {
      type: String,
      enum: [
        "consultation",
        "procedure",
        "room",
        "pharmacy",
        "diagnostics",
        "other",
      ],
      required: true,
    },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true, default: 0 },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const PaymentSchema = new Schema<IInvoicePayment>(
  {
    method: {
      type: String,
      enum: ["cash", "card", "upi", "insurance", "wallet"],
      required: true,
    },
    amount: { type: Number, required: true },
    reference: { type: String, trim: true },
    paidAt: { type: Date, default: Date.now },
    recordedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    isRefund: { type: Boolean, default: false },
  },
  { _id: false },
);

const HospitalInvoiceSchema = new Schema<IHospitalInvoice>(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    admissionId: {
      type: Schema.Types.ObjectId,
      ref: "Admission",
      default: null,
      index: true,
    },
    lineItems: { type: [LineItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    gstin: { type: String, trim: true, default: "" },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "unpaid", "partial", "paid", "refunded", "cancelled"],
      default: "unpaid",
      index: true,
    },
    payments: { type: [PaymentSchema], default: [] },
    notes: { type: String, trim: true },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

HospitalInvoiceSchema.index({ createdAt: -1 });
HospitalInvoiceSchema.index({ status: 1, createdAt: -1 });

export const HospitalInvoice = mongoose.model<IHospitalInvoice>(
  "HospitalInvoice",
  HospitalInvoiceSchema,
);

export default HospitalInvoice;
