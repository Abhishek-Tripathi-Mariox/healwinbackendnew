import mongoose, { Schema, Types } from "mongoose";

export interface IInvoice {
  _id: Types.ObjectId;
  invoiceNumber: string;
  bookingId: Types.ObjectId;
  userId: Types.ObjectId;
  enterpriseId?: Types.ObjectId;

  // Amounts
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  surgeCharge: number;
  addonCharges: number;
  loadingUnloadingCharge: number;
  waitingCharge: number;
  tollCharges: number;

  // Discounts
  promoDiscount: number;
  coinDiscount: number;
  enterpriseDiscount: number;

  // Taxes
  gstAmount: number;
  gstPercentage: number;

  // Totals
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;

  // GST Details
  customerGstin?: string;
  companyGstin: string;

  // Status
  status: "GENERATED" | "PAID" | "CANCELLED" | "REFUNDED";
  pdfUrl?: string;
  generatedAt: Date;
  paidAt?: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    enterpriseId: {
      type: Schema.Types.ObjectId,
      ref: "Enterprise",
    },

    // Amounts
    baseFare: { type: Number, required: true, min: 0 },
    distanceCharge: { type: Number, default: 0, min: 0 },
    timeCharge: { type: Number, default: 0, min: 0 },
    surgeCharge: { type: Number, default: 0, min: 0 },
    addonCharges: { type: Number, default: 0, min: 0 },
    loadingUnloadingCharge: { type: Number, default: 0, min: 0 },
    waitingCharge: { type: Number, default: 0, min: 0 },
    tollCharges: { type: Number, default: 0, min: 0 },

    // Discounts
    promoDiscount: { type: Number, default: 0, min: 0 },
    coinDiscount: { type: Number, default: 0, min: 0 },
    enterpriseDiscount: { type: Number, default: 0, min: 0 },

    // Taxes
    gstAmount: { type: Number, required: true, min: 0 },
    gstPercentage: { type: Number, required: true, min: 0 },

    // Totals
    subtotal: { type: Number, required: true, min: 0 },
    totalDiscount: { type: Number, default: 0, min: 0 },
    totalTax: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },

    // GST Details
    customerGstin: String,
    companyGstin: {
      type: String,
      required: true,
    },

    // Status
    status: {
      type: String,
      enum: ["GENERATED", "PAID", "CANCELLED", "REFUNDED"],
      default: "GENERATED",
      index: true,
    },
    pdfUrl: String,
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: Date,
  },
  { timestamps: true },
);

// Compound indexes
InvoiceSchema.index({ userId: 1, createdAt: -1 });
InvoiceSchema.index({ enterpriseId: 1, createdAt: -1 });

export default mongoose.model<IInvoice>("Invoice", InvoiceSchema);
