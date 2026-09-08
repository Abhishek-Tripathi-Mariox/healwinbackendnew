import { Request, Response, NextFunction } from "express";
import { MembershipPlan, UserMembership } from "../../models/membership.model";
import { expireLapsedMemberships } from "../../services/membership.service";

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

/**
 * GET /admin/membership/subscribers — who is actually enrolled.
 *
 * The panel could create and price plans but had no way to see a single
 * subscriber, so nobody could answer "how many people are on Gold" or "who
 * has not paid". Lapsed rows are swept before counting, so "active" here
 * means genuinely current rather than merely never-checked.
 */
export const subscribers = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10)));

  await expireLapsedMemberships();

  const query: any = {};
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.planId) query.planId = req.query.planId;
  if (req.query.paymentStatus) query.paymentStatus = String(req.query.paymentStatus);

  const [items, total, byStatus, revenue] = await Promise.all([
    UserMembership.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "fullName mobileNumber email")
      .lean(),
    UserMembership.countDocuments(query),
    UserMembership.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    UserMembership.aggregate([
      {
        $group: {
          _id: null,
          due: { $sum: "$amountDue" },
          collected: { $sum: "$amountPaid" },
        },
      },
    ]),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    summary: {
      byStatus: Object.fromEntries(byStatus.map((s: any) => [s._id, s.count])),
      amountDue: revenue[0]?.due || 0,
      amountCollected: revenue[0]?.collected || 0,
    },
  };
  req.msg = "success";
  return next();
};

/**
 * PUT /admin/membership/subscribers/:id/payment — record what was collected.
 * Payments are taken outside the app for now, so someone has to be able to
 * mark a membership settled without a gateway callback.
 */
export const recordPayment = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const status = String(b.paymentStatus || "");
  if (!["pending", "paid", "waived"].includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "paymentStatus must be pending, paid or waived" };
    return next();
  }
  const m: any = await UserMembership.findById(req.params.id as string);
  if (!m) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  m.paymentStatus = status;
  // "paid" with no figure means the plan price was collected in full.
  m.amountPaid =
    status === "paid"
      ? b.amountPaid !== undefined
        ? Number(b.amountPaid) || 0
        : m.amountDue
      : status === "waived"
        ? 0
        : Number(b.amountPaid) || 0;
  if (b.paymentRef) m.paymentRef = String(b.paymentRef);
  await m.save();
  req.rData = { item: m };
  req.msg = "saved";
  return next();
};

/** POST /admin/membership/expire-lapsed — run the sweep on demand. */
export const expireLapsed = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const expired = await expireLapsedMemberships();
  req.rData = { expired };
  req.msg = "success";
  return next();
};
