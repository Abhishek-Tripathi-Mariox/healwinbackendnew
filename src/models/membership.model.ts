import mongoose, { Schema, Types } from "mongoose";

/**
 * HealWin membership — admin-managed plans + a per-user active subscription.
 * Plans drive the patient-app membership carousel; UserMembership powers the
 * "active plan" card (enrolment + validity + family count). Pricing is editable
 * from the admin panel — these are starter values, not hardcoded app copy.
 */

export interface IMembershipPlan {
  _id: Types.ObjectId;
  tier: "silver" | "gold";
  name: string;
  price: number;
  durationMonths: number;
  concessionPercent?: number;
  bullets: string[];
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipPlanSchema = new Schema<IMembershipPlan>(
  {
    tier: { type: String, enum: ["silver", "gold"], default: "silver" },
    name: { type: String, required: true },
    price: { type: Number, default: 0 },
    durationMonths: { type: Number, default: 12 },
    concessionPercent: { type: Number, default: 0 },
    bullets: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
MembershipPlanSchema.index({ isActive: 1, isDeleted: 1, sortOrder: 1 });
export const MembershipPlan = mongoose.model<IMembershipPlan>("MembershipPlan", MembershipPlanSchema);

export interface IUserMembership {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  planName: string;
  tier: "silver" | "gold";
  enrolledAt: Date;
  validUpto: Date;
  status: "active" | "expired" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const UserMembershipSchema = new Schema<IUserMembership>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: "MembershipPlan", required: true },
    planName: String,
    tier: { type: String, enum: ["silver", "gold"], default: "silver" },
    enrolledAt: { type: Date, default: () => new Date() },
    validUpto: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active", index: true },
  },
  { timestamps: true },
);
UserMembershipSchema.index({ userId: 1, status: 1, createdAt: -1 });
export const UserMembership = mongoose.model<IUserMembership>("UserMembership", UserMembershipSchema);
