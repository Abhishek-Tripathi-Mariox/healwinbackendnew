import { Request, Response, NextFunction } from "express";
import { InsurancePayer, PatientPolicy, InsuranceClaim } from "../../models/insurance.model";
import { nextSequence } from "../../models/counter.model";
import { HospitalInvoice } from "../../models/hospital-invoice.model";
import { payablePoliciesFor } from "../../services/insurance-payment.service";

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
  if (req.query.approvalStatus) query.approvalStatus = String(req.query.approvalStatus);

  const [items, pendingCount] = await Promise.all([
    PatientPolicy.find(query)
      // Pending first: a verifier opening this page is here to clear the
      // queue, not to browse policies that were approved last month.
      .sort({ approvalStatus: 1, createdAt: -1 })
      .limit(200)
      .populate("payerId", "name type")
      .populate("patientId", "fullName patientId phone")
      .lean(),
    PatientPolicy.countDocuments({ approvalStatus: "pending" }),
  ]);

  req.rData = { items, pendingCount };
  req.msg = "success";
  return next();
};
export const createPolicy = async (req: Request, _res: Response, next: NextFunction) => {
  // A policy entered by billing staff has already been checked by the person
  // typing it — the approval gate exists for patient self-registration.
  if (req.body && !req.body.approvalStatus) {
    req.body.approvalStatus = "approved";
    req.body.source = "staff";
  }
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
/**
 * Auto-called when an invoice is finalized (billing.controller.ts#generate)
 * — drafts a claim so billing staff don't have to remember an admitted/OPD
 * patient is insured before they can raise one. Only acts when the patient
 * has EXACTLY ONE active policy (0 = nothing to claim against; 2+ = which
 * one is ambiguous, a human should pick) and skips if a claim already
 * exists for this invoice (no duplicates on repeated generate() calls).
 * Never blocks invoice finalization — callers should swallow errors.
 */
export const autoDraftClaimForInvoice = async (invoice: {
  _id: any;
  patientId: any;
  total: number;
}): Promise<any | null> => {
  const already = await InsuranceClaim.findOne({ invoiceId: invoice._id }).select("_id").lean();
  if (already) return null;

  const policies = await PatientPolicy.find({ patientId: invoice.patientId, isActive: true })
    .limit(2)
    .lean();
  if (policies.length !== 1) return null;
  const policy: any = policies[0];

  const seq = await nextSequence("insurance_claim");
  return InsuranceClaim.create({
    claimNumber: `CLM-${String(seq).padStart(6, "0")}`,
    patientId: invoice.patientId,
    policyId: policy._id,
    payerId: policy.payerId,
    invoiceId: invoice._id,
    claimedAmount: invoice.total,
    status: "draft",
  });
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
  // "insurance" payment so the patient's balance reflects the payout.
  //
  // `postedToInvoiceAt` guards the other route in: a bill paid FROM insurance
  // creates its claim already posted, and settling that claim afterwards must
  // not credit the invoice twice.
  if (status === "settled" && !wasSettled && claim.invoiceId && !claim.postedToInvoiceAt) {
    const payAmount = claim.approvedAmount || claim.claimedAmount || 0;
    if (payAmount > 0) {
      const inv: any = await HospitalInvoice.findById(claim.invoiceId);
      if (inv) {
        inv.payments.push({ method: "insurance", amount: payAmount, reference: claim.claimNumber, paidAt: new Date() });
        recomputeInvoice(inv);
        await inv.save();
        claim.postedToInvoiceAt = new Date();
      }
    }
  }
  await claim.save();
  req.rData = { item: claim }; req.msg = "updated"; return next();
};

/**
 * PUT /admin/insurance/policies/:id/approval  body: { approvalStatus, reviewNote? }
 *
 * Verifying a patient-registered policy. Only an approved policy can settle a
 * bill, so this is the gate that makes self-registration safe: the patient can
 * add anything, but nothing is spendable until someone has checked it against
 * the card.
 */
export const setPolicyApproval = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const status = String(req.body?.approvalStatus || "");
  if (!["pending", "approved", "rejected"].includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "approvalStatus must be pending, approved or rejected" };
    return next();
  }
  if (status === "rejected" && !String(req.body?.reviewNote || "").trim()) {
    // The patient sees this in the app; "rejected" with no reason is not
    // something they can act on.
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Give a reason when rejecting — the patient sees it." };
    return next();
  }

  const policy: any = await PatientPolicy.findById(req.params.id as string);
  if (!policy) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }

  // Withdrawing approval from a policy that has already paid for something
  // would leave claims standing against cover the hospital no longer accepts.
  if (policy.approvalStatus === "approved" && status !== "approved") {
    const claims = await InsuranceClaim.countDocuments({
      policyId: policy._id,
      status: { $in: ["approved", "settled"] },
    });
    if (claims > 0) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = {
        hint: `This policy has already settled ${claims} claim(s). Reverse those first if the approval was wrong.`,
      };
      return next();
    }
  }

  policy.approvalStatus = status;
  policy.reviewNote = req.body?.reviewNote || undefined;
  policy.approvedByAdminId = adminId;
  policy.approvedAt = status === "approved" ? new Date() : undefined;
  await policy.save();

  req.rData = { item: policy };
  req.msg = "saved";
  return next();
};

/**
 * GET /admin/insurance/patients/:patientId/payable
 * Policies that could pay this patient's bill, each with its live balance and
 * — where it cannot be used — the reason. Unusable ones are included so the
 * desk can say "still awaiting approval" rather than "no insurance found".
 */
export const payableForPatient = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const items = await payablePoliciesFor(req.params.patientId as string);
  req.rData = { items };
  req.msg = "success";
  return next();
};
