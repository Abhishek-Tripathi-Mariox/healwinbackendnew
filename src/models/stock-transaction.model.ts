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
  reason?: string;
  issuedToType?: "ward" | "patient" | "doctor" | "other";
  issuedToRef?: string; // free-form ref (ward name, patient id, etc.)
  performedByAdminId: Types.ObjectId;
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
    reason: { type: String, trim: true },
    issuedToType: {
      type: String,
      enum: ["ward", "patient", "doctor", "other"],
    },
    issuedToRef: { type: String, trim: true },
    performedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
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
