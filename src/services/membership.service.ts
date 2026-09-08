import { Types } from "mongoose";
import { UserMembership, MembershipPlan } from "../models/membership.model";

/**
 * Membership — resolving a user's live plan, and keeping `status` honest.
 *
 * `validUpto` was previously written and then never looked at again: nothing
 * ever moved a membership to "expired", so a plan that lapsed two years ago
 * still read as active and still would have granted its concession. Expiry is
 * therefore derived on every read here, and also swept in the background, so
 * the answer is right whether or not the sweep has run.
 */

export interface ActiveMembership {
  _id: Types.ObjectId;
  planId: Types.ObjectId;
  planName: string;
  tier: "silver" | "gold";
  enrolledAt: Date;
  validUpto: Date;
  concessionPercent: number;
  maxFamilyMembers: number;
  daysRemaining: number;
}

/**
 * The user's membership if it is genuinely current, else null.
 *
 * A row found to be past its validity is flipped to "expired" as a side
 * effect, so the correction happens the first time anyone looks rather than
 * waiting for a scheduled job.
 */
export const getActiveMembership = async (
  userId: Types.ObjectId | string,
): Promise<ActiveMembership | null> => {
  const m: any = await UserMembership.findOne({ userId, status: "active" })
    .sort({ createdAt: -1 })
    .lean();
  if (!m) return null;

  const now = new Date();
  if (m.validUpto && new Date(m.validUpto) < now) {
    await UserMembership.updateOne({ _id: m._id }, { $set: { status: "expired" } });
    return null;
  }

  // The concession lives on the PLAN, not the membership, so an admin editing
  // the plan changes what existing members get — which is the intent, and why
  // it is read fresh rather than snapshotted at enrolment.
  const plan: any = await MembershipPlan.findById(m.planId)
    .select("concessionPercent maxFamilyMembers isActive isDeleted")
    .lean();

  return {
    _id: m._id,
    planId: m.planId,
    planName: m.planName,
    tier: m.tier,
    enrolledAt: m.enrolledAt,
    validUpto: m.validUpto,
    // A plan that has been deactivated or deleted stops granting its benefit,
    // but the membership itself is left alone — cancelling what someone paid
    // for is a decision for a human, not a side effect of an admin edit.
    concessionPercent:
      plan && plan.isActive && !plan.isDeleted ? plan.concessionPercent || 0 : 0,
    maxFamilyMembers: plan?.maxFamilyMembers || 0,
    daysRemaining: Math.max(
      0,
      Math.ceil((new Date(m.validUpto).getTime() - now.getTime()) / 86400000),
    ),
  };
};

/** Just the concession — the fare path only needs this. */
export const getMembershipConcession = async (
  userId?: Types.ObjectId | string | null,
): Promise<number> => {
  if (!userId) return 0;
  const m = await getActiveMembership(userId);
  return m?.concessionPercent || 0;
};

/**
 * Sweep every lapsed membership to "expired".
 *
 * Reads are already self-correcting, so this exists for the reporting side:
 * an admin looking at "active members" should not be counting rows that only
 * look active because nobody has opened them lately.
 */
export const expireLapsedMemberships = async (): Promise<number> => {
  const res = await UserMembership.updateMany(
    { status: "active", validUpto: { $lt: new Date() } },
    { $set: { status: "expired" } },
  );
  return res.modifiedCount || 0;
};

export default {
  getActiveMembership,
  getMembershipConcession,
  expireLapsedMemberships,
};
