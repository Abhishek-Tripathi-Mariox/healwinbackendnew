import { Request, Response, NextFunction } from "express";

import PaymentOrder from "../../models/payment-order.model";
import { paginate } from "../../utils/paginate.util";
import { refundOrder, CheckoutError } from "../../services/checkout.service";

/**
 * Payments, as the finance desk sees them.
 *
 * Until now there was no such view: each domain kept its own payment columns
 * and a refund was a status change with no money behind it. Every real charge
 * in the app now lands in one collection, which is what makes a single
 * searchable list — and a refund button that actually calls the gateway —
 * possible at all.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const q: any = {};

  if (req.query.status) q.status = req.query.status;
  if (req.query.purpose) q.purpose = req.query.purpose;
  if (req.query.method) q.method = req.query.method;
  // Abandoned checkouts are noise on a finance screen, but they are the only
  // record of a customer who tried and failed — so they are hidden by default
  // and reachable with ?status=CREATED.
  else if (!req.query.status) q.status = { $ne: "CREATED" };

  const search = String(req.query.search || "").trim();
  if (search) {
    const rx = new RegExp(escape(search), "i");
    q.$or = [
      { gatewayOrderId: rx },
      { gatewayPaymentId: rx },
      { description: rx },
      { receipt: rx },
    ];
  }

  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(`${from}T00:00:00`);
    // Inclusive of the whole end day — a date range that silently drops the
    // last day is the classic "where did today's payments go" bug.
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999`);
  }

  const { items, pagination } = await paginate(
    PaymentOrder,
    q,
    req,
    { createdAt: -1 },
    [{ path: "userId", select: "fullName mobileNumber email" }],
    { defaultLimit: 25 },
  );

  // Totals for the CURRENT filter, not the current page — a page total is a
  // number nobody can act on.
  const [totals] = await PaymentOrder.aggregate([
    { $match: q },
    {
      $group: {
        _id: null,
        collected: { $sum: { $cond: [{ $eq: ["$status", "CREATED"] }, 0, "$amount"] } },
        refunded: { $sum: "$refundedAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  req.rData = {
    items,
    pagination,
    totals: {
      collected: Math.round((totals?.collected || 0) * 100) / 100,
      refunded: Math.round((totals?.refunded || 0) * 100) / 100,
      net: Math.round(((totals?.collected || 0) - (totals?.refunded || 0)) * 100) / 100,
      count: totals?.count || 0,
    },
  };
  req.msg = "success";
  return next();
};

export const detail = async (req: Request, _res: Response, next: NextFunction) => {
  const item = await PaymentOrder.findById(req.params.id)
    .populate("userId", "fullName mobileNumber email")
    .lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  req.rData = { item };
  req.msg = "success";
  return next();
};

/**
 * Refund, for real.
 *
 * Leaving `amount` out refunds whatever is still refundable, which is what
 * "refund this" almost always means and avoids the operator doing subtraction
 * on a part-refunded payment.
 */
export const refund = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const result = await refundOrder({
      paymentOrderId: String(req.params.id),
      amount: req.body?.amount != null ? Number(req.body.amount) : undefined,
      reason: String(req.body?.reason || "").trim() || undefined,
      by: (req as any).adminId,
    });
    req.rData = { refund: result };
    req.msg = `Refunded ₹${result.amount}.`;
    return next();
  } catch (err: any) {
    if (err instanceof CheckoutError) {
      req.rCode = err.status === 404 ? 5 : 0;
      req.msg = err.message;
      req.rData = {};
      return next();
    }
    // A gateway rejection is the operator's problem to see, not a 500 page.
    console.error("[admin/payments] refund failed:", err?.message || err);
    req.rCode = 0;
    req.msg = err?.error?.description || err?.message || "The refund was rejected by the gateway.";
    req.rData = {};
    return next();
  }
};

export default { list, detail, refund };
