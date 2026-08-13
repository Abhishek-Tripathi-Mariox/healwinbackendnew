import { Request, Response, NextFunction } from "express";
import HospitalInvoice from "../../models/hospital-invoice.model";
import type {
  IInvoiceLineItem,
  BillingSection,
} from "../../models/hospital-invoice.model";
import HospitalPatient from "../../models/hospital-patient.model";
import { Admin } from "../../models/admin.model";
import Admission from "../../models/admission.model";
import Bed from "../../models/bed.model";
import EmrEncounter from "../../models/emr-encounter.model";
import StockTransaction from "../../models/stock-transaction.model";
import { BillingAudit } from "../../models/billing-audit.model";
import { nextSequence } from "../../models/counter.model";
import { notifyHospitalPatient } from "../../services/hms-notify.service";
import { emitToAdmin } from "../../utils/socket.util";
import { autoDraftClaimForInvoice } from "./insurance.controller";

/**
 * Doctor Panel / HMS — Billing: invoices, payments, refunds and financial reports.
 */

const SECTIONS = new Set<BillingSection>([
  "consultation",
  "procedure",
  "nursing",
  "room",
  "bed",
  "pharmacy",
  "diagnostics",
  "other",
]);
const METHODS = new Set(["cash", "card", "upi", "insurance", "wallet"]);

const mintInvoiceNo = async (): Promise<string> => {
  const seq = await nextSequence("hospital_invoice");
  return `INV-${String(seq).padStart(6, "0")}`;
};

/** The method of the largest non-refund payment — used to refund "to original". */
const originalMethod = (inv: any): any => {
  const real = (inv.payments || []).filter((p: any) => !p.isRefund);
  if (real.length === 0) return "cash";
  return real.slice().sort((a: any, b: any) => b.amount - a.amount)[0].method;
};

/** Append an immutable billing audit record (refunds/advances/cancellations). */
const audit = async (
  inv: any,
  action: string,
  amount: number,
  method: string | undefined,
  byAdminId: any,
  note?: string,
) => {
  await BillingAudit.create({
    invoiceId: inv._id,
    invoiceNo: inv.invoiceNo,
    patientId: inv.patientId,
    action: action as any,
    amount,
    method,
    note,
    byAdminId,
  } as any).catch(() => undefined);
};

/** Normalizes line items and recomputes all monetary totals on an invoice doc. */
const normalizeLineItems = (raw: any[]): IInvoiceLineItem[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((li) => li && li.description && SECTIONS.has(li.section))
    .map((li) => {
      const quantity = Number(li.quantity) || 1;
      const unitPrice = Number(li.unitPrice) || 0;
      return {
        section: li.section,
        description: String(li.description),
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice * 100) / 100,
      };
    });

const recompute = (inv: any) => {
  inv.subtotal = inv.lineItems.reduce(
    (s: number, li: IInvoiceLineItem) => s + li.amount,
    0,
  );
  inv.taxAmount =
    Math.round(((inv.subtotal * (inv.taxPercent || 0)) / 100) * 100) / 100;
  // Intra-state GST split: CGST = SGST = half of total GST.
  inv.cgstAmount = Math.round((inv.taxAmount / 2) * 100) / 100;
  inv.sgstAmount = Math.round((inv.taxAmount - inv.cgstAmount) * 100) / 100;
  inv.total =
    Math.round((inv.subtotal + inv.taxAmount - (inv.discount || 0)) * 100) / 100;
  // amountPaid = sum of non-refund payments minus refunds.
  inv.amountPaid = inv.payments.reduce(
    (s: number, p: any) => s + (p.isRefund ? -p.amount : p.amount),
    0,
  );
  inv.amountPaid = Math.round(inv.amountPaid * 100) / 100;
  inv.balanceDue = Math.round((inv.total - inv.amountPaid) * 100) / 100;

  if (inv.status !== "cancelled" && inv.status !== "draft") {
    if (inv.payments.some((p: any) => p.isRefund)) inv.status = "refunded";
    else if (inv.amountPaid <= 0) inv.status = "unpaid";
    else if (inv.balanceDue > 0) inv.status = "partial";
    else inv.status = "paid";
  }
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.patientId) query.patientId = req.query.patientId;

  const [items, total] = await Promise.all([
    HospitalInvoice.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patientId", "patientId fullName phone")
      .lean(),
    HospitalInvoice.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "invoice_list";
  return next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const invoice = await HospitalInvoice.findById(req.params.id)
    .populate("patientId", "patientId fullName phone gender age")
    .lean();
  if (!invoice) {
    req.rCode = 5;
    req.msg = "invoice_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { invoice };
  req.msg = "invoice_detail";
  return next();
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.patientId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "patientId is required" };
    return next();
  }
  const patient = await HospitalPatient.findOne({
    _id: b.patientId,
    isDeleted: false,
  }).lean();
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  const invoice = new HospitalInvoice({
    invoiceNo: await mintInvoiceNo(),
    patientId: b.patientId,
    admissionId: b.admissionId || undefined,
    encounterId: b.encounterId || undefined,
    doctorId: b.doctorId || undefined,
    departmentId: b.departmentId || undefined,
    lineItems: normalizeLineItems(b.lineItems),
    taxPercent: Number(b.taxPercent) || 0,
    gstin: b.gstin || process.env.HOSPITAL_GSTIN || "",
    discount: Number(b.discount) || 0,
    notes: b.notes || undefined,
    status: b.status === "draft" ? "draft" : "unpaid",
    payments: [],
    createdByAdminId: adminId,
  });
  recompute(invoice);
  await invoice.save();

  // Notify the patient a bill is ready (unless still a draft).
  if (invoice.status !== "draft") {
    void notifyHospitalPatient(
      invoice.patientId,
      "Bill generated",
      `Invoice ${invoice.invoiceNo} for ₹${invoice.total} is ready. Balance due ₹${invoice.balanceDue}.`,
      { tab: "bills" },
    );
  }

  req.rData = { invoice };
  req.msg = "invoice_created";
  return next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const invoice = await HospitalInvoice.findById(req.params.id);
  if (!invoice) {
    req.rCode = 5;
    req.msg = "invoice_not_found";
    req.rData = {};
    return next();
  }
  const adminId = (req as any).adminId;
  if (b.lineItems !== undefined)
    invoice.lineItems = normalizeLineItems(b.lineItems);
  if (b.taxPercent !== undefined) invoice.taxPercent = Number(b.taxPercent) || 0;
  if (b.discount !== undefined) invoice.discount = Number(b.discount) || 0;
  if (b.notes !== undefined) invoice.notes = b.notes;
  if (b.doctorId !== undefined) (invoice as any).doctorId = b.doctorId || null;
  if (b.departmentId !== undefined) (invoice as any).departmentId = b.departmentId || null;

  // Cancelling a paid invoice auto-refunds the collected amount to the original
  // payment method (cancellation refund), and audit-logs it.
  if (b.status === "cancelled" && invoice.status !== "cancelled") {
    if (invoice.amountPaid > 0) {
      const method = originalMethod(invoice);
      const refundAmt = invoice.amountPaid;
      invoice.payments.push({
        method,
        amount: refundAmt,
        reference: "cancellation refund",
        paidAt: new Date(),
        recordedByAdminId: adminId,
        isRefund: true,
      });
      await audit(invoice, "cancellation_refund", refundAmt, method, adminId, "Auto-refund on cancellation");
    }
    invoice.status = "cancelled";
    await audit(invoice, "cancel", 0, undefined, adminId, b.cancelReason);
  }
  recompute(invoice);
  // recompute flips status by payments; force-keep cancelled.
  if (b.status === "cancelled") invoice.status = "cancelled";
  await invoice.save();

  req.rData = { invoice };
  req.msg = "invoice_updated";
  return next();
};

/** POST /admin/billing/:id/payment — record a payment. */
export const recordPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!METHODS.has(b.method)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "method must be cash | card | upi | insurance | wallet" };
    return next();
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "amount must be a positive number" };
    return next();
  }
  const invoice = await HospitalInvoice.findById(req.params.id);
  if (!invoice) {
    req.rCode = 5;
    req.msg = "invoice_not_found";
    req.rData = {};
    return next();
  }
  // Reject more than the outstanding balance. Without this a typo (5000 on a
  // 500 bill) silently produced a negative balanceDue and flipped the invoice
  // to "paid". Genuine prepayments go through /:id/advance instead.
  const outstanding = Math.round(((invoice.total || 0) - (invoice.amountPaid || 0)) * 100) / 100;
  if (amount > outstanding) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      outstanding,
      hint: `amount exceeds the balance due (₹${outstanding}). Record a smaller amount, or use the advance endpoint for a prepayment.`,
    };
    return next();
  }
  invoice.payments.push({
    method: b.method,
    amount,
    reference: b.reference || undefined,
    paidAt: b.paidAt ? new Date(b.paidAt) : new Date(),
    recordedByAdminId: adminId,
    isRefund: false,
  });
  recompute(invoice);
  await invoice.save();
  await audit(invoice, "payment", amount, b.method, adminId, b.reference);
  try {
    emitToAdmin("billing:updated", {
      invoiceId: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      patientId: String(invoice.patientId),
      admissionId: invoice.admissionId ? String(invoice.admissionId) : null,
      total: invoice.total,
      balanceDue: invoice.balanceDue,
    });
  } catch {
    /* non-fatal */
  }

  req.rData = { invoice };
  req.msg = "payment_recorded";
  return next();
};

/** POST /admin/billing/:id/refund — record a refund against an invoice. */
export const refund = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const amount = Number(b.amount);
  const invoice = await HospitalInvoice.findById(req.params.id);
  if (!invoice) {
    req.rCode = 5;
    req.msg = "invoice_not_found";
    req.rData = {};
    return next();
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > invoice.amountPaid) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `refund must be > 0 and <= amount paid (${invoice.amountPaid})`,
    };
    return next();
  }
  // Refund to the ORIGINAL payment method by default (or an explicit override).
  const method = b.method && METHODS.has(b.method) ? b.method : originalMethod(invoice);
  invoice.payments.push({
    method,
    amount,
    reference: b.reference || "refund",
    paidAt: new Date(),
    recordedByAdminId: adminId,
    isRefund: true,
  });
  recompute(invoice);
  await invoice.save();
  await audit(invoice, "refund", amount, method, adminId, b.reference);

  req.rData = { invoice };
  req.msg = "refund_processed";
  return next();
};

/** POST /admin/billing/:id/advance — record an advance deposit (adjustable). */
export const recordAdvance = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!METHODS.has(b.method)) {
    req.rCode = 0; req.msg = "validation_failed";
    req.rData = { hint: "method must be cash | card | upi | insurance | wallet" };
    return next();
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "amount must be positive" };
    return next();
  }
  const invoice = await HospitalInvoice.findById(req.params.id);
  if (!invoice) { req.rCode = 5; req.msg = "invoice_not_found"; req.rData = {}; return next(); }
  // An advance is just a payment flagged isAdvance — it adjusts the balance like
  // any payment, but is reported separately and can be refunded if unused.
  invoice.payments.push({
    method: b.method,
    amount,
    reference: b.reference || "advance deposit",
    paidAt: new Date(),
    recordedByAdminId: adminId,
    isRefund: false,
    isAdvance: true,
  });
  recompute(invoice);
  await invoice.save();
  await audit(invoice, "advance", amount, b.method, adminId, b.reference);
  req.rData = { invoice };
  req.msg = "advance_recorded";
  return next();
};

/** GET /admin/billing/:id/pdf — invoice as a PDF (streamed). */
export const invoicePdf = async (req: Request, res: Response) => {
  const invoice = await HospitalInvoice.findById(req.params.id)
    .populate("patientId", "fullName patientId phone")
    .lean();
  if (!invoice) return res.status(404).json({ code: 5, message: "invoice not found" });
  const { generateInvoicePDF } = await import("../../services/pdf.service");
  const buffer = await generateInvoicePDF(invoice);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNo}.pdf"`);
  return res.end(buffer);
};

/** GET /admin/billing/:id/receipt — payment receipt as a PDF (streamed). */
export const receiptPdf = async (req: Request, res: Response) => {
  const invoice = await HospitalInvoice.findById(req.params.id)
    .populate("patientId", "fullName patientId phone")
    .lean();
  if (!invoice) return res.status(404).json({ code: 5, message: "invoice not found" });
  const { generateReceiptPDF } = await import("../../services/pdf.service");
  const buffer = await generateReceiptPDF(invoice);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="receipt-${invoice.invoiceNo}.pdf"`);
  return res.end(buffer);
};

/** GET /admin/billing/:id/audits — money-movement audit trail for an invoice. */
export const auditTrail = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await BillingAudit.find({ invoiceId: req.params.id })
    .sort({ createdAt: -1 })
    .populate("byAdminId", "fullName")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: Date, to: Date) =>
  Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));

/** Real bed-day charges for an admission's stay so far — bedHistory × each bed's daily charge. */
const computeBedChargeLines = async (admissionId: any): Promise<IInvoiceLineItem[]> => {
  const admission = await Admission.findById(admissionId).lean();
  if (!admission) return [];
  const now = new Date();
  const bedIds = (admission.bedHistory || []).map((h) => h.bedId).filter(Boolean);
  const beds = await Bed.find({ _id: { $in: bedIds as any } }).lean();
  const rateById = new Map(beds.map((bd) => [String(bd._id), bd.dailyCharge || 0]));
  const lines: IInvoiceLineItem[] = [];
  for (const h of admission.bedHistory || []) {
    const from = new Date(h.fromAt);
    const to = h.toAt ? new Date(h.toAt) : now;
    const days = daysBetween(from, to);
    const rate = h.bedId ? rateById.get(String(h.bedId)) || 0 : 0;
    lines.push({
      section: "bed",
      description: `Bed ${h.ward}/${h.bedNumber} × ${days} day(s)`,
      quantity: days,
      unitPrice: rate,
      amount: Math.round(days * rate * 100) / 100,
    });
  }
  return lines;
};

/**
 * Real pharmacy consumption issued against this ref — an admissionId for
 * IPD dispensing, or a patientId for OPD (see emr.controller.ts#dispense,
 * which tags issuedToRef with whichever is correct for the encounter).
 */
const computePharmacyLines = async (ref: string): Promise<IInvoiceLineItem[]> => {
  const issued: any[] = await StockTransaction.find({
    type: "out",
    issuedToType: "patient",
    issuedToRef: ref,
    // Already-billed issues are skipped so a charge appended at dispense time
    // is not pulled in again by a later generate().
    invoiceId: null,
  })
    .populate("itemId", "name unitCost sellingPrice unit")
    .lean();
  const lines: IInvoiceLineItem[] = [];
  for (const tx of issued) {
    const item: any = tx.itemId;
    if (!item) continue;
    // Charge the patient the SELLING price, not what we paid for it.
    // unitCost is our purchase cost (used for COGS/wastage reporting) — billing
    // at it gave the medicine away at zero margin. Fall back to unitCost only
    // when no selling price is configured, so nothing bills at 0.
    const unit = item.sellingPrice || item.unitCost || 0;
    lines.push({
      section: "pharmacy",
      description: `${item.name} × ${tx.quantity} ${item.unit || ""}`.trim(),
      quantity: tx.quantity,
      unitPrice: unit,
      amount: Math.round(tx.quantity * unit * 100) / 100,
    });
  }
  return lines;
};

/** Real procedure lines across every IPD encounter documented during an admission's stay so far. */
const computeProcedureLinesForAdmission = async (patientId: any, admittedAt: Date): Promise<IInvoiceLineItem[]> => {
  const encounters = await EmrEncounter.find({
    patientId,
    encounterType: "IPD",
    visitDate: { $gte: admittedAt },
    proceduresInvoiceId: null,
  })
    .select("procedures")
    .lean();
  const lines: IInvoiceLineItem[] = [];
  for (const enc of encounters) {
    for (const proc of (enc as any).procedures || []) {
      const amount = Number(proc.price) || 0;
      lines.push({
        section: "procedure",
        description: proc.name + (proc.notes ? ` (${proc.notes})` : ""),
        quantity: 1,
        unitPrice: amount,
        amount,
      });
    }
  }
  return lines;
};

/**
 * Append charges to the patient's OPEN bill, creating one if there isn't a
 * suitable one yet.
 *
 * This is what makes billing automatic: instead of a clerk remembering to hit
 * "Generate" after every event, each billable thing that happens (medicine
 * dispensed, test reported, procedure done) pushes its own line onto the one
 * bill the counter is collecting against.
 *
 * "Open" means draft / unpaid / partial, scoped to the same admission — an IPD
 * stay accumulates onto its own bill, OPD charges onto the patient's open OPD
 * bill. A paid or cancelled invoice is never reopened; a new one is started.
 *
 * Returns null when there is nothing to add. Callers treat a failure here as
 * non-fatal — a billing hiccup must never undo the clinical event.
 */
export const appendToOpenInvoice = async (opts: {
  patientId: any;
  admissionId?: any;
  encounterId?: any;
  doctorId?: any;
  lines: IInvoiceLineItem[];
  adminId: any;
}): Promise<any | null> => {
  const lines = (opts.lines || []).filter((li) => li && li.description);
  if (lines.length === 0) return null;

  let invoice: any = await HospitalInvoice.findOne({
    patientId: opts.patientId,
    admissionId: opts.admissionId || null,
    status: { $in: ["draft", "unpaid", "partial"] },
  }).sort({ createdAt: -1 });

  if (!invoice) {
    invoice = new HospitalInvoice({
      invoiceNo: await mintInvoiceNo(),
      patientId: opts.patientId,
      admissionId: opts.admissionId || undefined,
      encounterId: opts.encounterId || undefined,
      doctorId: opts.doctorId || undefined,
      lineItems: [],
      gstin: process.env.HOSPITAL_GSTIN || "",
      status: "unpaid",
      payments: [],
      createdByAdminId: opts.adminId,
    });
  }

  invoice.lineItems.push(...lines);
  recompute(invoice);
  await invoice.save();

  // Push the update so a charges panel someone already has open reflects it
  // live, rather than only on reopen. Fire-and-forget — billing must not fail
  // because a socket is down.
  try {
    emitToAdmin("billing:updated", {
      invoiceId: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      patientId: String(opts.patientId),
      admissionId: opts.admissionId ? String(opts.admissionId) : null,
      total: invoice.total,
      balanceDue: invoice.balanceDue,
      addedLines: lines.length,
    });
  } catch {
    /* non-fatal */
  }
  return invoice;
};

/**
 * Live running charges for an in-progress admission — the same three sources
 * the discharge draft uses (bed-days so far, pharmacy issued to this
 * admission, procedures documented during the stay), but computed on demand
 * and NOT persisted.
 *
 * Exists because an IPD bill previously only became visible at discharge, so
 * the ward had no idea what a stay had run up, and families could not pay
 * against it mid-stay. Returns the accrued lines plus the admission's real
 * invoice (if one exists) so the caller can show accrued-vs-collected.
 */
export const computeAdmissionCharges = async (opts: {
  patientId: any;
  admissionId: any;
}) => {
  const admission: any = await Admission.findById(opts.admissionId)
    .select("admittedAt")
    .lean();
  const [bedLines, pharmacyLines, procedureLines] = await Promise.all([
    computeBedChargeLines(opts.admissionId),
    computePharmacyLines(String(opts.admissionId)),
    admission
      ? computeProcedureLinesForAdmission(opts.patientId, admission.admittedAt)
      : Promise.resolve([]),
  ]);
  const lineItems = [...bedLines, ...pharmacyLines, ...procedureLines];
  const accrued =
    Math.round(lineItems.reduce((sum, li) => sum + (li.amount || 0), 0) * 100) / 100;

  // Advances/part-payments are taken against the admission's invoice, which
  // may not exist yet during the stay.
  const invoice: any = await HospitalInvoice.findOne({
    admissionId: opts.admissionId,
  })
    .select("invoiceNo total amountPaid balanceDue status")
    .lean();

  return {
    lineItems,
    accrued,
    invoice: invoice || null,
    // What is still uncollected: the real bill's balance if one exists,
    // otherwise everything accrued so far.
    outstanding: invoice
      ? invoice.balanceDue
      : accrued,
  };
};

/**
 * Auto-called on IPD discharge (see ipd.controller.ts#discharge) — drafts an
 * invoice from the charges that are fully automatic/real-data-driven (bed
 * days + pharmacy issued to this admission), so billing doesn't depend on a
 * clerk remembering to click "Generate" after every discharge. Left as
 * status "draft" — room/nursing/consultation rates and diagnostics still
 * need a human to fill in and finalize before it's a real bill (those need
 * judgment `generate` still handles). Skips silently (returns null) if a
 * bill already exists for this admission or there's nothing to bill yet —
 * never blocks the discharge itself.
 */
export const autoDraftInvoiceOnDischarge = async (opts: {
  patientId: any;
  admissionId: any;
  adminId: any;
}): Promise<any | null> => {
  const existing = await HospitalInvoice.findOne({ admissionId: opts.admissionId }).select("_id").lean();
  if (existing) return null;

  const admission: any = await Admission.findById(opts.admissionId).select("admittedAt").lean();
  const [bedLines, pharmacyLines, procedureLines] = await Promise.all([
    computeBedChargeLines(opts.admissionId),
    computePharmacyLines(String(opts.admissionId)),
    admission ? computeProcedureLinesForAdmission(opts.patientId, admission.admittedAt) : Promise.resolve([]),
  ]);
  const lineItems = [...bedLines, ...pharmacyLines, ...procedureLines];
  if (lineItems.length === 0) return null;

  const invoice = new HospitalInvoice({
    invoiceNo: await mintInvoiceNo(),
    patientId: opts.patientId,
    admissionId: opts.admissionId,
    lineItems,
    taxPercent: 0,
    gstin: process.env.HOSPITAL_GSTIN || "",
    discount: 0,
    status: "draft",
    payments: [],
    createdByAdminId: opts.adminId,
  });
  recompute(invoice);
  await invoice.save();
  return invoice;
};

/**
 * Raise a one-line consultation invoice for an OPD appointment.
 *
 * Called by the OPD booking flow (opd.controller#create) so the front desk has
 * something to collect against the moment a slot is booked, rather than waiting
 * for the doctor to finish an encounter and generate a bill after the fact.
 *
 * The fee comes from the doctor's own configured rate
 * (`Admin.doctorProfile.consultationFee`) — the same source
 * `generate()` falls back to — so OPD and encounter billing never disagree.
 *
 * Returns null (never throws) when there is nothing to bill: no fee configured,
 * or the doctor record is gone. Callers treat that as "no invoice", not an error —
 * a missing fee must never block a booking.
 */
export const createConsultationInvoice = async (params: {
  patientId: any;
  doctorId: any;
  appointmentId: any;
  adminId: any;
}) => {
  const doc: any = await Admin.findById(params.doctorId)
    .select("fullName doctorProfile.consultationFee")
    .lean();
  const fee = Number(doc?.doctorProfile?.consultationFee) || 0;
  if (fee <= 0) return null;

  const invoice = await HospitalInvoice.create({
    invoiceNo: await mintInvoiceNo(),
    patientId: params.patientId,
    doctorId: params.doctorId,
    lineItems: [
      {
        section: "consultation",
        description: `Consultation — ${doc?.fullName || "Doctor"}`,
        quantity: 1,
        unitPrice: fee,
        amount: fee,
      },
    ],
    subtotal: fee,
    total: fee,
    balanceDue: fee,
    amountPaid: 0,
    status: "unpaid",
    notes: `OPD appointment ${String(params.appointmentId)}`,
    createdByAdminId: params.adminId,
  });
  return invoice;
};

/**
 * POST /admin/billing/generate — cross-module invoice generation.
 *
 * Assembles invoice line items automatically from other HMS modules:
 *   • IPD bed-day charges  — from an admission's bed history × each bed's
 *     daily charge (section "room").
 *   • Diagnostics          — from an EMR encounter's lab + imaging orders
 *     (section "diagnostics", priced at `diagnosticRate`).
 *   • Consultation         — optional flat consultation fee.
 *
 * body: { patientId, admissionId?, encounterId?, includeBedCharges?,
 *         includeDiagnostics?, includeConsultation?, consultationFee?,
 *         diagnosticRate?, taxPercent?, discount? }
 */
export const generate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.patientId) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "patientId is required" };
    return next();
  }
  const patient = await HospitalPatient.findOne({
    _id: b.patientId,
    isDeleted: false,
  }).lean();
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  const lineItems: IInvoiceLineItem[] = [];
  let admissionId: any;

  // --- IPD bed-day charges (section "bed") ---
  if (b.admissionId && b.includeBedCharges !== false) {
    const admission = await Admission.findById(b.admissionId).select("_id").lean();
    if (admission) {
      admissionId = admission._id;
      lineItems.push(...(await computeBedChargeLines(b.admissionId)));
    }
  }

  // --- Room rent (per day OR per hour) ---
  if (b.includeRoomRent && Number(b.roomRate) > 0) {
    const rate = Number(b.roomRate);
    const perHour = b.roomUnit === "hour";
    const qty = Number(b.roomQty) || 1;
    lineItems.push({
      section: "room",
      description: `Room rent × ${qty} ${perHour ? "hour(s)" : "day(s)"}`,
      quantity: qty,
      unitPrice: rate,
      amount: Math.round(qty * rate * 100) / 100,
    });
  }

  // --- Nursing fees (flat or per-day) ---
  if (b.includeNursing && Number(b.nursingFee) > 0) {
    const fee = Number(b.nursingFee);
    const qty = Number(b.nursingDays) || 1;
    lineItems.push({
      section: "nursing",
      description: `Nursing charges × ${qty} day(s)`,
      quantity: qty,
      unitPrice: fee,
      amount: Math.round(qty * fee * 100) / 100,
    });
  }

  // --- Pharmacy consumption (auto-pulled from stock issued to this patient) ---
  if (b.includePharmacy !== false) {
    const ref = String(b.admissionId || b.patientId);
    lineItems.push(...(await computePharmacyLines(ref)));
  }

  // --- Diagnostics + procedures from an EMR encounter, real consultation fee ---
  let resolvedConsultationFee = Number(b.consultationFee) || 0;
  if (b.encounterId) {
    const enc = await EmrEncounter.findById(b.encounterId).lean();
    if (enc) {
      if (b.includeDiagnostics !== false) {
        const rate = Number(b.diagnosticRate) || 0;
        for (const lab of enc.labOrders || [])
          lineItems.push({
            section: "diagnostics",
            description: `Lab: ${lab}`,
            quantity: 1,
            unitPrice: rate,
            amount: rate,
          });
        for (const img of enc.imagingOrders || [])
          lineItems.push({
            section: "diagnostics",
            description: `Imaging: ${img}`,
            quantity: 1,
            unitPrice: rate,
            amount: rate,
          });
      }

      // Real procedure lines — the price snapshotted on the encounter when
      // the doctor picked it from the Procedure catalog (or typed a
      // free-text one with a manual price), not a flat amount billing
      // staff has to know/guess after the fact.
      if (b.includeProcedures !== false) {
        for (const proc of enc.procedures || []) {
          const amount = Number(proc.price) || 0;
          lineItems.push({
            section: "procedure",
            description: proc.name + (proc.notes ? ` (${proc.notes})` : ""),
            quantity: 1,
            unitPrice: amount,
            amount,
          });
        }
      }

      // Default the consultation fee to the doctor's real configured rate
      // (Admin.doctorProfile.consultationFee) when the caller didn't
      // explicitly override it — real data instead of billing staff typing
      // a number from memory.
      if (!b.consultationFee && enc.doctorId) {
        const doc: any = await Admin.findById(enc.doctorId).select("doctorProfile.consultationFee").lean();
        resolvedConsultationFee = doc?.doctorProfile?.consultationFee || 0;
      }
    }
  }

  // --- Consultation fee (with or without an encounter) ---
  if (b.includeConsultation !== false && resolvedConsultationFee > 0) {
    lineItems.push({
      section: "consultation",
      description: "Consultation fee",
      quantity: 1,
      unitPrice: resolvedConsultationFee,
      amount: resolvedConsultationFee,
    });
  }

  if (lineItems.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "nothing to bill — no bed charges, diagnostics or consultation produced any line item",
    };
    return next();
  }

  // A draft may already exist for this admission (auto-created on discharge
  // — see autoDraftInvoiceOnDischarge). Finalize that one in place instead
  // of minting a duplicate: replace its lineItems with the freshly computed
  // set (bed/pharmacy recomputed fresh + whatever manual lines were just
  // added) and flip it to "unpaid". Any OTHER (non-draft) invoice already on
  // this admission blocks a second bill outright — real hospitals don't
  // double-bill a stay.
  const admissionRef = admissionId || b.admissionId;
  const existing = admissionRef
    ? await HospitalInvoice.findOne({ admissionId: admissionRef })
    : null;
  if (existing && existing.status !== "draft") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `invoice ${existing.invoiceNo} already exists for this admission (${existing.status}) — edit or pay that one instead`,
    };
    return next();
  }

  let invoice: any;
  if (existing) {
    existing.lineItems = lineItems;
    existing.encounterId = b.encounterId || existing.encounterId;
    existing.doctorId = b.doctorId || existing.doctorId;
    existing.departmentId = b.departmentId || existing.departmentId;
    existing.taxPercent = Number(b.taxPercent) || 0;
    existing.gstin = b.gstin || existing.gstin || process.env.HOSPITAL_GSTIN || "";
    existing.discount = Number(b.discount) || 0;
    existing.status = "unpaid";
    recompute(existing);
    await existing.save();
    invoice = existing;
  } else {
    invoice = new HospitalInvoice({
      invoiceNo: await mintInvoiceNo(),
      patientId: b.patientId,
      admissionId: admissionRef || undefined,
      encounterId: b.encounterId || undefined,
      doctorId: b.doctorId || undefined,
      departmentId: b.departmentId || undefined,
      lineItems,
      taxPercent: Number(b.taxPercent) || 0,
      gstin: b.gstin || process.env.HOSPITAL_GSTIN || "",
      discount: Number(b.discount) || 0,
      status: "unpaid",
      payments: [],
      createdByAdminId: adminId,
    });
    recompute(invoice);
    await invoice.save();
  }

  // Notify the patient a bill is ready (unless still a draft).
  if (invoice.status !== "draft") {
    void notifyHospitalPatient(
      invoice.patientId,
      "Bill generated",
      `Invoice ${invoice.invoiceNo} for ₹${invoice.total} is ready. Balance due ₹${invoice.balanceDue}.`,
      { tab: "bills" },
    );
    // Draft an insurance claim automatically if this patient holds exactly
    // one active policy — billing staff previously had to remember to raise
    // one manually. Never blocks the invoice itself.
    await autoDraftClaimForInvoice(invoice).catch(() => null);
  }

  req.rData = { invoice };
  req.msg = "invoice_created";
  return next();
};

/**
 * GET /admin/billing/reports?from=&to= — daily collections, outstanding dues
 * and a revenue summary for the given date window (defaults to last 30 days).
 */
export const reports = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  const from = req.query.from
    ? new Date(req.query.from as string)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const invoices = await HospitalInvoice.find({
    createdAt: { $gte: from, $lte: to },
    status: { $ne: "cancelled" },
  }).lean();

  let totalBilled = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let totalRefunded = 0;
  let totalAdvance = 0;
  let totalTax = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalTaxable = 0;
  const sectionRevenue: Record<string, number> = {};
  const methodCollections: Record<string, number> = {};
  const dailyCollections: Record<string, number> = {};
  const doctorAgg: Record<string, number> = {};
  const deptAgg: Record<string, number> = {};

  for (const inv of invoices) {
    totalBilled += inv.total;
    totalCollected += inv.amountPaid;
    totalOutstanding += Math.max(0, inv.balanceDue);
    totalTax += inv.taxAmount || 0;
    totalCgst += inv.cgstAmount || 0;
    totalSgst += inv.sgstAmount || 0;
    totalTaxable += inv.subtotal || 0;
    if ((inv as any).doctorId) doctorAgg[String((inv as any).doctorId)] = (doctorAgg[String((inv as any).doctorId)] || 0) + inv.total;
    if ((inv as any).departmentId) deptAgg[String((inv as any).departmentId)] = (deptAgg[String((inv as any).departmentId)] || 0) + inv.total;
    for (const li of inv.lineItems)
      sectionRevenue[li.section] = (sectionRevenue[li.section] || 0) + li.amount;
    for (const p of inv.payments) {
      if (p.isRefund) {
        totalRefunded += p.amount;
        continue;
      }
      if ((p as any).isAdvance) totalAdvance += p.amount;
      methodCollections[p.method] =
        (methodCollections[p.method] || 0) + p.amount;
      const day = new Date(p.paidAt).toISOString().slice(0, 10);
      dailyCollections[day] = (dailyCollections[day] || 0) + p.amount;
    }
  }

  // Resolve doctor + department names for the revenue breakdowns.
  const { Admin } = await import("../../models/admin.model");
  const Department = (await import("../../models/department.model")).default;
  const doctorIds = Object.keys(doctorAgg);
  const deptIds = Object.keys(deptAgg);
  const [docs, depts] = await Promise.all([
    doctorIds.length ? Admin.find({ _id: { $in: doctorIds } }).select("fullName").lean() : [],
    deptIds.length ? Department.find({ _id: { $in: deptIds } }).select("name").lean() : [],
  ]);
  const docName = new Map(docs.map((d: any) => [String(d._id), d.fullName]));
  const deptName = new Map(depts.map((d: any) => [String(d._id), d.name]));
  const r2 = (n: number) => Math.round(n * 100) / 100;

  req.rData = {
    window: { from, to },
    summary: {
      invoiceCount: invoices.length,
      totalBilled: r2(totalBilled),
      totalCollected: r2(totalCollected),
      totalOutstanding: r2(totalOutstanding),
      totalRefunded: r2(totalRefunded),
      totalAdvance: r2(totalAdvance),
    },
    taxSummary: {
      taxableValue: r2(totalTaxable),
      totalTax: r2(totalTax),
      cgst: r2(totalCgst),
      sgst: r2(totalSgst),
    },
    sectionRevenue,
    methodCollections,
    doctorRevenue: Object.entries(doctorAgg)
      .map(([id, amount]) => ({ doctorId: id, name: docName.get(id) || "Doctor", amount: r2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    departmentRevenue: Object.entries(deptAgg)
      .map(([id, amount]) => ({ departmentId: id, name: deptName.get(id) || "Department", amount: r2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    dailyCollections: Object.entries(dailyCollections)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: r2(amount) })),
  };
  req.msg = "report_generated";
  return next();
};
