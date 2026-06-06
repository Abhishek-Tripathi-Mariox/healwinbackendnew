import Invoice, { IInvoice } from "../models/invoice.model";
import Booking from "../models/booking.model";
import { AppConfig } from "../models/app-config.model";
import { Types } from "mongoose";

/**
 * Generate invoice number
 */
const generateInvoiceNumber = async (): Promise<string> => {
  const prefix = "MZ-INV";
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");

  const count = await Invoice.countDocuments({
    createdAt: {
      $gte: new Date(date.getFullYear(), date.getMonth(), 1),
      $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    },
  });

  return `${prefix}-${year}${month}-${String(count + 1).padStart(5, "0")}`;
};

/**
 * Generate invoice for completed booking
 */
export const generateInvoice = async (
  bookingId: Types.ObjectId,
): Promise<IInvoice> => {
  const booking = await Booking.findById(bookingId)
    .populate("userId", "fullName mobileNumber email")
    .populate("enterpriseId");

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.status !== "COMPLETED") {
    throw new Error("Invoice can only be generated for completed bookings");
  }

  // Check if invoice already exists
  const existingInvoice = await Invoice.findOne({ bookingId });
  if (existingInvoice) {
    return existingInvoice;
  }

  // Get company GSTIN from config
  const gstinConfig = await AppConfig.findOne({ key: "COMPANY_GSTIN" });
  const companyGstin = gstinConfig?.value || "GSTIN-NOT-SET";

  const invoiceNumber = await generateInvoiceNumber();

  const invoice = await Invoice.create({
    invoiceNumber,
    bookingId,
    userId: booking.userId,
    enterpriseId: booking.enterpriseId,

    // Amounts
    baseFare: booking.baseFare || booking.fare,
    distanceCharge: booking.distanceCharge || 0,
    timeCharge: booking.timeCharge || 0,
    surgeCharge: booking.surgeFare || 0,
    addonCharges: booking.addonTotal || 0,
    loadingUnloadingCharge: booking.loadingUnloading?.charge || 0,
    waitingCharge: booking.waitingCharge || 0,
    tollCharges: booking.tollCharges || 0,

    // Discounts
    promoDiscount: booking.promoDiscount || 0,
    coinDiscount: booking.coinDiscount || 0,
    enterpriseDiscount: booking.enterpriseDiscount || 0,

    // Taxes
    gstAmount: booking.gstAmount || 0,
    gstPercentage: booking.gstPercentage || 5,

    // Totals
    subtotal: booking.subtotal || booking.fare,
    totalDiscount: booking.totalDiscount || booking.discount || 0,
    totalTax: booking.gstAmount || 0,
    grandTotal: booking.finalFare,

    // GST Details
    companyGstin,

    status: booking.paymentStatus === "PAID" ? "PAID" : "GENERATED",
    paidAt: booking.paymentStatus === "PAID" ? new Date() : undefined,
  });

  // Update booking with invoice reference
  await Booking.findByIdAndUpdate(bookingId, { invoiceId: invoice._id });

  return invoice;
};

/**
 * Get invoice by ID
 */
export const getInvoiceById = async (invoiceId: Types.ObjectId) => {
  return await Invoice.findById(invoiceId)
    .populate("bookingId")
    .populate("userId", "fullName mobileNumber email")
    .populate("enterpriseId", "companyName gstin");
};

/**
 * Get invoice by booking ID
 */
export const getInvoiceByBookingId = async (bookingId: Types.ObjectId) => {
  return await Invoice.findOne({ bookingId })
    .populate("bookingId")
    .populate("userId", "fullName mobileNumber email");
};

/**
 * Get user invoices
 */
export const getUserInvoices = async (
  userId: Types.ObjectId,
  page = 0,
  limit = 20,
) => {
  return await Invoice.find({ userId })
    .populate("bookingId", "bookingNumber pickup drop vehicleTypeId createdAt")
    .sort({ createdAt: -1 })
    .skip(page * limit)
    .limit(limit);
};

/**
 * Get enterprise invoices
 */
export const getEnterpriseInvoices = async (
  enterpriseId: Types.ObjectId,
  dateFrom?: Date,
  dateTo?: Date,
  page = 0,
  limit = 20,
) => {
  const query: any = { enterpriseId };

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = dateFrom;
    if (dateTo) query.createdAt.$lte = dateTo;
  }

  const invoices = await Invoice.find(query)
    .populate("bookingId", "bookingNumber pickup drop vehicleTypeId")
    .populate("userId", "fullName")
    .sort({ createdAt: -1 })
    .skip(page * limit)
    .limit(limit);

  const total = await Invoice.countDocuments(query);

  // Calculate totals
  const totals = await Invoice.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" },
        totalDiscount: { $sum: "$totalDiscount" },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    invoices,
    total,
    summary: totals[0] || {
      totalAmount: 0,
      totalTax: 0,
      totalDiscount: 0,
      count: 0,
    },
  };
};

/**
 * Update invoice with customer GSTIN
 */
export const updateCustomerGstin = async (
  invoiceId: Types.ObjectId,
  customerGstin: string,
) => {
  return await Invoice.findByIdAndUpdate(
    invoiceId,
    { customerGstin: customerGstin.toUpperCase() },
    { returnDocument: "after" },
  );
};

/**
 * Mark invoice as paid
 */
export const markInvoicePaid = async (invoiceId: Types.ObjectId) => {
  return await Invoice.findByIdAndUpdate(
    invoiceId,
    { status: "PAID", paidAt: new Date() },
    { returnDocument: "after" },
  );
};

/**
 * Generate monthly invoice summary for enterprise
 */
export const generateMonthlyInvoiceSummary = async (
  enterpriseId: Types.ObjectId,
  year: number,
  month: number,
) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const invoices = await Invoice.find({
    enterpriseId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const summary = {
    year,
    month,
    totalInvoices: invoices.length,
    totalAmount: 0,
    totalTax: 0,
    totalDiscount: 0,
    byStatus: {} as Record<string, number>,
  };

  invoices.forEach((inv) => {
    summary.totalAmount += inv.grandTotal;
    summary.totalTax += inv.totalTax;
    summary.totalDiscount += inv.totalDiscount;
    summary.byStatus[inv.status] = (summary.byStatus[inv.status] || 0) + 1;
  });

  return summary;
};
