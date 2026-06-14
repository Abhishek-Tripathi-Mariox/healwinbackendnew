import { Request, Response, NextFunction } from "express";
import { MembershipPlan, UserMembership } from "../../models/membership.model";

/**
 * Admin CRUD for membership plans (the patient-app membership carousel source).
 * Plans drive pricing/benefits; editing here reflects in the app immediately.
 */

const sanitize = (b: any) => {
  const patch: any = {};
  if (typeof b.tier === "string") patch.tier = b.tier === "gold" ? "gold" : "silver";
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (b.price !== undefined) patch.price = Number(b.price) || 0;
  if (b.durationMonths !== undefined) patch.durationMonths = Number(b.durationMonths) || 12;
  if (b.concessionPercent !== undefined) patch.concessionPercent = Number(b.concessionPercent) || 0;
  if (Array.isArray(b.bullets)) patch.bullets = b.bullets.map((s: any) => String(s)).filter(Boolean);
  if (b.sortOrder !== undefined) patch.sortOrder = Number(b.sortOrder) || 0;
  if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
  return patch;
};

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const plans = await MembershipPlan.find({ isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, price: 1 })
    .lean();
  // Subscriber counts give the admin a quick sense of plan uptake.
  const counts = await UserMembership.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$planId", n: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c: any) => [String(c._id), c.n]));
  req.rData = {
    items: plans.map((p) => ({ ...p, activeSubscribers: countMap.get(String(p._id)) || 0 })),
    total: plans.length,
  };
  req.msg = "membership_plans_listed";
  next();
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  const patch = sanitize(req.body);
  if (!patch.name) {
    return res.status(400).json({ rCode: 0, rMsg: "name_required", rData: {} });
  }
  const item = await MembershipPlan.create({ ...patch, isActive: patch.isActive ?? true, isDeleted: false });
  req.rData = { item };
  req.msg = "membership_plan_created";
  next();
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  const item = await MembershipPlan.findByIdAndUpdate(
    req.params.id,
    sanitize(req.body),
    { returnDocument: "after" },
  ).lean();
  if (!item) return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  req.rData = { item };
  req.msg = "membership_plan_updated";
  next();
};

export const toggle = async (req: Request, res: Response, next: NextFunction) => {
  const plan = await MembershipPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  plan.isActive = !plan.isActive;
  await plan.save();
  req.rData = { item: plan };
  req.msg = "membership_plan_toggled";
  next();
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  // Soft-delete so existing UserMembership references stay intact.
  const item = await MembershipPlan.findByIdAndUpdate(
    req.params.id,
    { isDeleted: true, isActive: false },
    { returnDocument: "after" },
  ).lean();
  if (!item) return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  req.rData = {};
  req.msg = "membership_plan_deleted";
  next();
};
