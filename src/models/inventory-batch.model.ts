import mongoose, { Schema, Types } from "mongoose";

/**
 * A received lot of an InventoryItem, with its own expiry + cost — so a SKU
 * with stock from two different deliveries (different expiry dates / prices)
 * can be tracked and issued FEFO (First-Expired-First-Out) instead of the
 * item having one scalar `expiryDate`/`batchNo` that can only describe a
 * single lot at a time.
 *
 * `InventoryItem.currentStock` remains the authoritative TOTAL (sum across
 * all of an item's non-depleted batches) — every existing code path that
 * reads it (ward stock, ambulance stock, billing, low-stock alerts) keeps
 * working unchanged; batches are an added layer underneath it, kept in sync
 * by inventory-batch.service.ts's `receiveBatch`/`issueFefo`.
 */

export interface IInventoryBatch {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  batchNo?: string;
  expiryDate?: Date;
  quantity: number; // remaining in this batch
  unitCost?: number;
  receivedAt: Date;
  source: "manual" | "purchase_order" | "opening_stock";
  poNumber?: string;
  isDepleted: boolean;
  createdByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryBatchSchema = new Schema<IInventoryBatch>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    batchNo: { type: String, trim: true },
    expiryDate: { type: Date, index: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    unitCost: Number,
    receivedAt: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ["manual", "purchase_order", "opening_stock"],
      default: "manual",
    },
    poNumber: { type: String, trim: true },
    isDepleted: { type: Boolean, default: false, index: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

// FEFO issuance: "which batches of item X, soonest-expiring first".
InventoryBatchSchema.index({ itemId: 1, isDepleted: 1, expiryDate: 1 });

export const InventoryBatch = mongoose.model<IInventoryBatch>(
  "InventoryBatch",
  InventoryBatchSchema,
);

export default InventoryBatch;
