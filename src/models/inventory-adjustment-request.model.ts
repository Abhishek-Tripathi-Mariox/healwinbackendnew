import mongoose, { Schema, Types } from "mongoose";

/**
 * Maker-checker for manual central-inventory corrections: a stock adjust
 * (in/out) or a batch write-off doesn't move any stock the moment an admin
 * submits it — it sits here as "pending" until a DIFFERENT admin (with
 * INVENTORY_APPROVE) approves it, at which point the actual movement is
 * executed (via receiveBatch/issueFefo/writeOffBatch) and journalled.
 * Mirrors the existing crew stock-request → admin-approval pattern, applied
 * to admin-initiated corrections instead of crew restock requests.
 */

export type AdjustmentType = "adjust_in" | "adjust_out" | "writeoff";
export type AdjustmentStatus = "pending" | "approved" | "rejected";

export interface IInventoryAdjustmentRequest {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  batchId?: Types.ObjectId; // set for "writeoff" — the specific batch
  type: AdjustmentType;
  quantity: number;
  reason?: string;
  wastageReason?: "expired" | "damaged" | "lost" | "other"; // "writeoff" only
  // "adjust_in" only — the batch this receipt should create.
  batchNo?: string;
  expiryDate?: Date;
  unitCost?: number;
  status: AdjustmentStatus;
  requestedByAdminId: Types.ObjectId;
  requestedAt: Date;
  reviewedByAdminId?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  resultTransactionId?: Types.ObjectId; // set once approved + executed
  createdAt: Date;
  updatedAt: Date;
}

const InventoryAdjustmentRequestSchema = new Schema<IInventoryAdjustmentRequest>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch" },
    type: { type: String, enum: ["adjust_in", "adjust_out", "writeoff"], required: true },
    quantity: { type: Number, required: true },
    reason: { type: String, trim: true },
    wastageReason: { type: String, enum: ["expired", "damaged", "lost", "other"] },
    batchNo: { type: String, trim: true },
    expiryDate: Date,
    unitCost: Number,
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    requestedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    requestedAt: { type: Date, default: Date.now },
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: Date,
    reviewNotes: { type: String, trim: true },
    resultTransactionId: { type: Schema.Types.ObjectId, ref: "StockTransaction" },
  },
  { timestamps: true },
);
InventoryAdjustmentRequestSchema.index({ status: 1, createdAt: -1 });

export const InventoryAdjustmentRequest = mongoose.model<IInventoryAdjustmentRequest>(
  "InventoryAdjustmentRequest",
  InventoryAdjustmentRequestSchema,
);

export default InventoryAdjustmentRequest;
