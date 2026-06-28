import { Request, Response, NextFunction } from "express";
import { InsurancePayer, PatientPolicy, InsuranceClaim } from "../../models/insurance.model";
import { nextSequence } from "../../models/counter.model";
import { HospitalInvoice } from "../../models/hospital-invoice.model";

/** Recompute amountPaid / balanceDue / status from an invoice's payments. */
const recomputeInvoice = (inv: any) => {
  inv.amountPaid = (inv.payments || []).reduce(
    (sum: number, p: any) => sum + (p.isRefund ? -p.amount : p.amount),
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

/** Admin: insurance payers (insurer/TPA), patient policies, and claims. */

// ===== Payers =====
export const listPayers = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await InsurancePayer.find({ isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const createPayer = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.name) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "name required" };
    return next();
  }
  const item = await InsurancePayer.create({
    name: b.name, type: b.type === "tpa" ? "tpa" : "insurer", code: b.code,
    contactPhone: b.contactPhone, contactEmail: b.contactEmail,
  });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updatePayer = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await InsurancePayer.findByIdAndUpdate(
    req.params.id as string,
    { $set: { name: b.name, type: b.type, code: b.code, contactPhone: b.contactPhone, contactEmail: b.contactEmail, isActive: b.isActive } },
    { new: true },
  );
  if (!item) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  req.rData = { item }; req.msg = "updated"; return next();
};
export const deletePayer = async (req: Request, _res: Response, next: NextFunction) => {
  await InsurancePayer.findByIdAndUpdate(req.params.id as string, { isDeleted: true, isActive: false });
  req.rData = {}; req.msg = "deleted"; return next();
};

// ===== Policies =====
export const listPolicies = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.patientId) query.patientId = req.query.patientId;
  const items = await PatientPolicy.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("payerId", "name type")
    .populate("patientId", "fullName patientId phone")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const createPolicy = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.patientId || !b.payerId || !b.policyNumber) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "patientId, payerId, policyNumber required" };
    return next();
  }
  const item = await PatientPolicy.create({
    patientId: b.patientId, payerId: b.payerId, policyNumber: b.policyNumber,
    holderName: b.holderName, sumInsured: Number(b.sumInsured) || 0,
    validFrom: b.validFrom ? new Date(b.validFrom) : undefined,
    validTo: b.validTo ? new Date(b.validTo) : undefined,
  });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updatePolicy = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await PatientPolicy.findByIdAndUpdate(
    req.params.id as string,
    { $set: {
      payerId: b.payerId, policyNumber: b.policyNumber, holderName: b.holderName,
      sumInsured: b.sumInsured != null ? Number(b.sumInsured) : undefined,
      validFrom: b.validFrom ? new Date(b.validFrom) : undefined,
      validTo: b.validTo ? new Date(b.validTo) : undefined,
      isActive: b.isActive,
    } },
    { new: true },
  );
  if (!item) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  req.rData = { item }; req.msg = "updated"; return next();
};

// ===== Claims =====
export const listClaims = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.patientId) query.patientId = req.query.patientId;
  const items = await InsuranceClaim.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("payerId", "name type")
    .populate("patientId", "fullName patientId phone")
    .populate("policyId", "policyNumber")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const createClaim = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const policy: any = await PatientPolicy.findById(b.policyId).lean();
  if (!policy) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "valid policyId required" };
    return next();
  }
  const seq = await nextSequence("insurance_claim");
  const item = await InsuranceClaim.create({
    claimNumber: `CLM-${String(seq).padStart(6, "0")}`,
    patientId: policy.patientId,
    policyId: policy._id,
    payerId: policy.payerId,
    invoiceId: b.invoiceId || undefined,
    claimedAmount: Number(b.claimedAmount) || 0,
    notes: b.notes,
    status: "draft",
  });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updateClaimStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const status = String(b.status || "").toLowerCase();
  const allowed = ["draft", "submitted", "approved", "rejected", "settled"];
  if (!allowed.includes(status)) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: `status one of ${allowed.join(", ")}` };
    return next();
  }
  const claim: any = await InsuranceClaim.findById(req.params.id as string);
  if (!claim) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  const wasSettled = claim.status === "settled";
  if (b.approvedAmount != null) claim.approvedAmount = Number(b.approvedAmount);
  if (b.notes != null) claim.notes = b.notes;
  if (status === "submitted") claim.submittedAt = new Date();
  if (status === "settled") claim.settledAt = new Date();
  claim.status = status;

  // On settlement, post the approved amount to the linked invoice as an
  // "insurance" payment (once) so the patient's balance reflects the payout.
  if (status === "settled" && !wasSettled && claim.invoiceId) {
    const payAmount = claim.approvedAmount || claim.claimedAmount || 0;
    if (payAmount > 0) {
      const inv: any = await HospitalInvoice.findById(claim.invoiceId);
      if (inv) {
        inv.payments.push({ method: "insurance", amount: payAmount, reference: claim.claimNumber, paidAt: new Date() });
        recomputeInvoice(inv);
        await inv.save();
      }
    }
  }
  await claim.save();
  req.rData = { item: claim }; req.msg = "updated"; return next();
};
