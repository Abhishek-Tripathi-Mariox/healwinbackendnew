import InventoryItem from "../models/inventory-item.model";
import StockTransaction from "../models/stock-transaction.model";
import InventoryAdjustmentRequest, {
  IInventoryAdjustmentRequest,
} from "../models/inventory-adjustment-request.model";
import { receiveBatch, issueFefo, writeOffBatch } from "./inventory-batch.service";

const WASTAGE_REASONS = new Set(["expired", "damaged", "lost", "other"]);

/** Submit a correction for review — no stock moves until it's approved. */
export const submitAdjustmentRequest = async (opts: {
  itemId: any;
  batchId?: any;
  type: "adjust_in" | "adjust_out" | "writeoff";
  quantity: number;
  reason?: string;
  wastageReason?: string;
  batchNo?: string;
  expiryDate?: Date | string;
  unitCost?: number;
  requestedByAdminId: any;
}) => {
  const quantity = Math.max(0, Number(opts.quantity) || 0);
  if (!quantity) throw new Error("quantity_required");
  if (opts.type === "writeoff" && !opts.batchId) throw new Error("batchId_required");

  const item = await InventoryItem.exists({ _id: opts.itemId, isDeleted: false });
  if (!item) throw new Error("item_not_found");

  return InventoryAdjustmentRequest.create({
    itemId: opts.itemId,
    batchId: opts.batchId || undefined,
    type: opts.type,
    quantity,
    reason: opts.reason,
    wastageReason:
      opts.type === "writeoff"
        ? ((WASTAGE_REASONS.has(opts.wastageReason || "") ? opts.wastageReason : "other") as
            | "expired"
            | "damaged"
            | "lost"
            | "other")
        : undefined,
    batchNo: opts.type === "adjust_in" ? opts.batchNo : undefined,
    expiryDate: opts.type === "adjust_in" && opts.expiryDate ? new Date(opts.expiryDate) : undefined,
    unitCost: opts.type === "adjust_in" ? opts.unitCost : undefined,
    requestedByAdminId: opts.requestedByAdminId,
  });
};

/**
 * Approve a pending request: executes the actual stock movement (via the
 * same receiveBatch/issueFefo/writeOffBatch used everywhere else) and
 * journals it. Refuses self-approval — that's the entire point of
 * maker-checker.
 */
export const approveAdjustmentRequest = async (opts: {
  requestId: any;
  reviewerAdminId: any;
  reviewNotes?: string;
}): Promise<IInventoryAdjustmentRequest> => {
  const req: any = await InventoryAdjustmentRequest.findById(opts.requestId);
  if (!req) throw new Error("request_not_found");
  if (req.status !== "pending") throw new Error("request_already_reviewed");
  if (String(req.requestedByAdminId) === String(opts.reviewerAdminId)) {
    throw new Error("cannot_approve_own_request");
  }

  let txn;
  if (req.type === "adjust_in") {
    const result = await receiveBatch({
      itemId: req.itemId,
      batchNo: req.batchNo,
      expiryDate: req.expiryDate,
      quantity: req.quantity,
      unitCost: req.unitCost,
      performedByAdminId: req.requestedByAdminId,
    });
    txn = await StockTransaction.create({
      itemId: req.itemId,
      type: "in",
      quantity: req.quantity,
      balanceAfter: result.currentStock,
      amount: req.unitCost != null ? Math.round(req.unitCost * req.quantity * 100) / 100 : undefined,
      reason: req.reason,
      performedByAdminId: req.requestedByAdminId,
    });
  } else if (req.type === "adjust_out") {
    const result = await issueFefo({ itemId: req.itemId, quantity: req.quantity });
    txn = await StockTransaction.create({
      itemId: req.itemId,
      type: "out",
      quantity: req.quantity,
      balanceAfter: result.currentStock,
      amount: result.costOfGoodsIssued,
      reason: req.reason,
      performedByAdminId: req.requestedByAdminId,
    });
  } else {
    const result = await writeOffBatch({ batchId: req.batchId, quantity: req.quantity });
    const amount = Math.round(result.quantity * (result.batch.unitCost || 0) * 100) / 100;
    txn = await StockTransaction.create({
      itemId: result.item._id,
      type: "out",
      quantity: result.quantity,
      balanceAfter: result.item.currentStock,
      amount,
      reason: req.reason || `Write-off: ${req.wastageReason}`,
      isWastage: true,
      wastageReason: req.wastageReason,
      batchId: result.batch._id,
      performedByAdminId: req.requestedByAdminId,
    });
  }

  req.status = "approved";
  req.reviewedByAdminId = opts.reviewerAdminId;
  req.reviewedAt = new Date();
  req.reviewNotes = opts.reviewNotes;
  req.resultTransactionId = txn._id;
  await req.save();
  return req;
};

export const rejectAdjustmentRequest = async (opts: {
  requestId: any;
  reviewerAdminId: any;
  reviewNotes?: string;
}): Promise<IInventoryAdjustmentRequest> => {
  const req: any = await InventoryAdjustmentRequest.findById(opts.requestId);
  if (!req) throw new Error("request_not_found");
  if (req.status !== "pending") throw new Error("request_already_reviewed");

  req.status = "rejected";
  req.reviewedByAdminId = opts.reviewerAdminId;
  req.reviewedAt = new Date();
  req.reviewNotes = opts.reviewNotes;
  await req.save();
  return req;
};
