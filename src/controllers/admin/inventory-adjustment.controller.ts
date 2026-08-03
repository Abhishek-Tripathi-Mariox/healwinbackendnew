import { Request, Response, NextFunction } from "express";
import InventoryAdjustmentRequest from "../../models/inventory-adjustment-request.model";
import { approveAdjustmentRequest, rejectAdjustmentRequest } from "../../services/inventory-adjustment.service";

/**
 * Maker-checker queue for manual inventory corrections (adjust in/out,
 * batch write-offs) — see inventory-adjustment.service.ts.
 */

/** GET /admin/inventory/adjustment-requests?status=pending — the review queue. */
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.query.status || "pending");
  const query: any = ["pending", "approved", "rejected"].includes(status) ? { status } : {};
  const items = await InventoryAdjustmentRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("itemId", "name sku unit")
    .populate("batchId", "batchNo expiryDate")
    .populate("requestedByAdminId", "fullName")
    .populate("reviewedByAdminId", "fullName")
    .lean();
  req.rData = {
    items: items.map((r: any) => ({
      _id: String(r._id),
      itemId: String(r.itemId?._id || r.itemId),
      itemName: r.itemId?.name || "Item",
      unit: r.itemId?.unit || "",
      batchNo: r.batchId?.batchNo || r.batchNo || null,
      type: r.type,
      quantity: r.quantity,
      reason: r.reason || null,
      wastageReason: r.wastageReason || null,
      unitCost: r.unitCost ?? null,
      expiryDate: r.expiryDate || null,
      status: r.status,
      requestedBy: r.requestedByAdminId?.fullName || "—",
      requestedByAdminId: String(r.requestedByAdminId?._id || r.requestedByAdminId),
      requestedAt: r.requestedAt,
      reviewedBy: r.reviewedByAdminId?.fullName || null,
      reviewedAt: r.reviewedAt || null,
      reviewNotes: r.reviewNotes || null,
    })),
  };
  req.msg = "success";
  return next();
};

/** POST /admin/inventory/adjustment-requests/:id/approve */
export const approve = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const reviewerAdminId = (req as any).adminId;
    const request = await approveAdjustmentRequest({
      requestId: req.params.id as string,
      reviewerAdminId,
      reviewNotes: req.body?.notes || undefined,
    });
    req.rData = { request };
    req.msg = "approved";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "approve_failed";
    req.rData = {};
    return next();
  }
};

/** POST /admin/inventory/adjustment-requests/:id/reject */
export const reject = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const reviewerAdminId = (req as any).adminId;
    const request = await rejectAdjustmentRequest({
      requestId: req.params.id as string,
      reviewerAdminId,
      reviewNotes: req.body?.notes || undefined,
    });
    req.rData = { request };
    req.msg = "rejected";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "reject_failed";
    req.rData = {};
    return next();
  }
};
