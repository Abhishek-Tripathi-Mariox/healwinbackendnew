import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Stock movement journal.
 *
 * Every issuance ("out" — to a ward / patient / doctor) or replenishment
 * ("in" — purchase / return) is recorded here with the resulting balance,
 * so an item's stock history is fully auditable.
 */

export interface IStockTransaction {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  type: "in" | "out";
  quantity: number;
  balanceAfter: number;
  // Real ₹ value of this movement (quantity × the actual cost involved —
  // for "out", the weighted cost of the specific batches drawn via FEFO, not
  // just the item's current scalar unitCost, which may be stale). Powers
  // stock valuation + wastage-value reporting.
  amount?: number;
  reason?: string;
  issuedToType?: "ward" | "patient" | "doctor" | "other";
  issuedToRef?: string; // free-form ref (ward name, patient id, etc.)
  // Set when this "out" movement is a write-off (expired/damaged/lost stock)
  // rather than ordinary issuance — keeps wastage separately reportable
  // instead of being buried in generic "out" movements.
  isWastage?: boolean;
  wastageReason?: "expired" | "damaged" | "lost" | "other";
  batchId?: Types.ObjectId; // the specific InventoryBatch written off, if any
  // Exactly one of these is set: an admin/staff action (ward issue, dispense,
  // write-off, PO receipt) vs. a patient self-service action (pharmacy
  // commerce checkout draws real HMS stock the same way EMR dispensing does).
  performedByAdminId?: Types.ObjectId;
  performedByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StockTransactionSchema = new Schema<IStockTransaction>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
      index: true,
    },
    type: { type: String, enum: ["in", "out"], required: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    amount: Number,
    reason: { type: String, trim: true },
    issuedToType: {
      type: String,
      enum: ["ward", "patient", "doctor", "other"],
    },
    issuedToRef: { type: String, trim: true },
    isWastage: { type: Boolean, default: false, index: true },
    wastageReason: { type: String, enum: ["expired", "damaged", "lost", "other"] },
    batchId: { type: Schema.Types.ObjectId, ref: "InventoryBatch" },
    performedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    performedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

StockTransactionSchema.index({ itemId: 1, createdAt: -1 });

export const StockTransaction = mongoose.model<IStockTransaction>(
  "StockTransaction",
  StockTransactionSchema,
);

export default StockTransaction;
