import { Types } from "mongoose";
import {
  PatientPolicy,
  InsuranceClaim,
  IPatientPolicy,
} from "../models/insurance.model";
import { nextSequence } from "../models/counter.model";

/**
 * Paying a bill from a patient's insurance.
 *
 * "Insurance" used to be nothing but a label on a payment row: any amount
 * could be recorded against it with no policy, no cover check and no claim.
 * The money simply left the bill. This makes it real — a payment from
 * insurance now has to name a policy that is
 *
 *   • APPROVED — a patient-registered policy is unverified until billing
 *     staff have checked it, and unverified cover cannot settle a bill;
 *   • THIS patient's — a policy belongs to one person, and the cover on it
 *     is theirs; and
 *   • within its REMAINING cover — sum insured minus what is already
 *     approved, settled or awaiting a decision.
 *
 * Each deduction raises a real InsuranceClaim against the invoice, so the
 * hospital's claims list and the patient's remaining balance both reflect it.
 */

export interface PolicyBalance {
  policyId: string;
  payerId: string;
  payerName: string;
  policyNumber: string;
  holderName: string;
  sumInsured: number;
  used: number;
  pending: number;
  remaining: number;
  approvalStatus: string;
  validTo?: Date | null;
  expired: boolean;
  usable: boolean;
  reason?: string;
}

/** What is left on a policy, counting claims already in flight. */
export const balanceOf = async (
  policy: IPatientPolicy & { payerId: any },
): Promise<PolicyBalance> => {
  const claims = await InsuranceClaim.find({ policyId: policy._id })
    .select("status claimedAmount approvedAmount")
    .lean();

  const used = claims
    .filter((c) => c.status === "approved" || c.status === "settled")
    .reduce((s, c) => s + (c.approvedAmount || c.claimedAmount || 0), 0);
  // Submitted claims are not yet spent, but the money is spoken for — letting
  // it be spent twice is how a policy goes overdrawn.
  const pending = claims
    .filter((c) => c.status === "submitted" || c.status === "draft")
    .reduce((s, c) => s + (c.claimedAmount || 0), 0);

  const sumInsured = policy.sumInsured || 0;
  const remaining = Math.max(0, Math.round((sumInsured - used - pending) * 100) / 100);
  const expired = !!policy.validTo && new Date(policy.validTo) < new Date();

  let reason: string | undefined;
  if (policy.approvalStatus !== "approved") {
    reason =
      policy.approvalStatus === "rejected"
        ? "This policy was rejected during verification."
        : "Awaiting verification by the billing team.";
  } else if (policy.isActive === false) {
    reason = "This policy is marked inactive.";
  } else if (expired) {
    reason = "This policy has expired.";
  } else if (remaining <= 0) {
    reason = "No cover remaining on this policy.";
  }

  return {
    policyId: String(policy._id),
    payerId: String(policy.payerId?._id || policy.payerId),
    payerName: policy.payerId?.name || "Insurer",
    policyNumber: policy.policyNumber,
    holderName: policy.holderName || "",
    sumInsured,
    used,
    pending,
    remaining,
    approvalStatus: policy.approvalStatus,
    validTo: policy.validTo || null,
    expired,
    usable: !reason,
    reason,
  };
};

/**
 * Policies that could pay for this patient's bill, each with its balance and,
 * where it cannot be used, the reason why. Unusable ones are returned rather
 * than hidden so the desk can tell the patient "it's still awaiting approval"
 * instead of "you have no insurance".
 */
export const payablePoliciesFor = async (
  patientId: Types.ObjectId | string,
): Promise<PolicyBalance[]> => {
  const policies: any[] = await PatientPolicy.find({ patientId })
    .populate("payerId", "name type")
    .sort({ approvalStatus: 1, createdAt: -1 })
    .lean();
  return Promise.all(policies.map((p) => balanceOf(p)));
};

export interface DeductionResult {
  ok: boolean;
  reason?: string;
  claim?: any;
  balance?: PolicyBalance;
}

/**
 * Check a proposed deduction and, if it holds up, raise the claim.
 *
 * Returns a reason instead of throwing, because every failure here is
 * something the person at the billing desk needs to read and act on.
 */
export const deductFromPolicy = async (params: {
  policyId: string;
  patientId: Types.ObjectId | string;
  invoiceId?: Types.ObjectId | string;
  amount: number;
  adminId?: Types.ObjectId | string;
  notes?: string;
}): Promise<DeductionResult> => {
  const { policyId, patientId, amount } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Enter a positive amount to claim." };
  }

  const policy: any = await PatientPolicy.findById(policyId)
    .populate("payerId", "name type")
    .lean();
  if (!policy) return { ok: false, reason: "That policy no longer exists." };

  // The policy must belong to the person being billed. Without this check the
  // desk could settle one patient's bill from another patient's cover.
  if (String(policy.patientId) !== String(patientId)) {
    return {
      ok: false,
      reason: "That policy belongs to a different patient and cannot pay this bill.",
    };
  }

  const balance = await balanceOf(policy);
  if (!balance.usable) return { ok: false, reason: balance.reason, balance };

  if (amount > balance.remaining) {
    return {
      ok: false,
      reason: `Only ₹${balance.remaining.toLocaleString("en-IN")} of cover remains on this policy.`,
      balance,
    };
  }

  const seq = await nextSequence("insurance_claim");
  const claim = await InsuranceClaim.create({
    claimNumber: `CLM-${String(seq).padStart(6, "0")}`,
    patientId,
    policyId: policy._id,
    payerId: policy.payerId?._id || policy.payerId,
    invoiceId: params.invoiceId,
    claimedAmount: amount,
    approvedAmount: amount,
    // The hospital has accepted this against the patient's cover and reduced
    // their bill by it, so from the hospital's side it is approved. Settlement
    // (money actually arriving from the insurer) stays a separate step.
    status: "approved",
    notes: params.notes,
    submittedAt: new Date(),
    // The caller records the payment on the invoice in the same breath, so
    // this claim is already reflected there. Marking it settled later must
    // NOT post the amount a second time.
    postedToInvoiceAt: params.invoiceId ? new Date() : undefined,
  });

  return { ok: true, claim, balance: await balanceOf(policy) };
};

export default { balanceOf, payablePoliciesFor, deductFromPolicy };
