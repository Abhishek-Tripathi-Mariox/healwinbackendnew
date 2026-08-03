import mongoose, { Schema, Types } from "mongoose";

/**
 * Per-ward inventory — mirrors ambulance-stock.model.ts's pattern, giving
 * each ward its own real stock custody instead of the free-text
 * `StockTransaction.issuedToRef` note that existed before.
 *
 *  • `WardStock`            — current on-hand quantity of each InventoryItem
 *                              IN a given ward (unique ward+item).
 *  • `WardStockTransaction` — the movement journal for that stock:
 *      - type "in"  → issued to the ward from central inventory, transferred
 *                     in from another ward, or a positive adjustment
 *                     (found/returned stock).
 *      - type "out" → consumed/wasted at the ward, transferred out to another
 *                     ward, or a negative adjustment.
 */

export interface IWardStock {
  _id: Types.ObjectId;
  wardId: Types.ObjectId;
  itemId: Types.ObjectId;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const WardStockSchema = new Schema<IWardStock>(
  {
    wardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);
WardStockSchema.index({ wardId: 1, itemId: 1 }, { unique: true });

export const WardStock = mongoose.model<IWardStock>("WardStock", WardStockSchema);

export interface IWardStockTransaction {
  _id: Types.ObjectId;
  wardId: Types.ObjectId;
  itemId: Types.ObjectId;
  itemName: string;
  type: "in" | "out";
  quantity: number;
  balanceAfter: number; // ward on-hand qty after this movement
  unitCost?: number;
  sellingPrice?: number;
  reason: "restock" | "consumption" | "adjustment" | "transfer";
  // The OTHER ward involved, only set when reason is "transfer" — lets the
  // journal show "transferred to/from X" instead of just an opaque out/in.
  transferWardId?: Types.ObjectId;
  notes?: string;
  performedByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WardStockTransactionSchema = new Schema<IWardStockTransaction>(
  {
    wardId: { type: Schema.Types.ObjectId, ref: "Ward", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    itemName: { type: String, required: true },
    type: { type: String, enum: ["in", "out"], required: true, index: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    unitCost: Number,
    sellingPrice: Number,
    reason: {
      type: String,
      enum: ["restock", "consumption", "adjustment", "transfer"],
      default: "consumption",
      index: true,
    },
    transferWardId: { type: Schema.Types.ObjectId, ref: "Ward" },
    notes: { type: String, trim: true },
    performedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);
WardStockTransactionSchema.index({ wardId: 1, createdAt: -1 });

export const WardStockTransaction = mongoose.model<IWardStockTransaction>(
  "WardStockTransaction",
  WardStockTransactionSchema,
);
