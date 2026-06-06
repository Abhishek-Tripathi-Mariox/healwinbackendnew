import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — Inventory item.
 *
 * One document = one tracked SKU: a consumable, a medicine, or a piece of
 * equipment. Stock levels are kept denormalized on the item (`currentStock`)
 * and every movement is journalled in StockTransaction so the running balance
 * is auditable. Two alert signals are derived from this model:
 *   • low stock      — currentStock <= reorderThreshold
 *   • expiring soon   — expiryDate within N days (consumables / medicines)
 */

export type InventoryCategory = "consumable" | "medicine" | "equipment";

export interface IInventoryItem {
  _id: Types.ObjectId;
  name: string;
  sku: string; // unique stock-keeping code
  category: InventoryCategory;
  unit: string; // e.g. "box", "strip", "piece", "ml"
  currentStock: number;
  reorderThreshold: number;
  unitCost?: number;
  // Consumables / medicines: expiry tracking.
  expiryDate?: Date;
  batchNo?: string;
  // Equipment: maintenance tracking.
  maintenanceStatus?: "operational" | "under_maintenance" | "out_of_service";
  lastServicedAt?: Date;
  nextMaintenanceAt?: Date;
  location?: string; // ward / store / room
  notes?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    name: { type: String, required: true, trim: true, index: true },
    sku: { type: String, required: true, unique: true, trim: true },
    category: {
      type: String,
      enum: ["consumable", "medicine", "equipment"],
      required: true,
      index: true,
    },
    unit: { type: String, required: true, trim: true, default: "piece" },
    currentStock: { type: Number, default: 0 },
    reorderThreshold: { type: Number, default: 0 },
    unitCost: Number,
    expiryDate: { type: Date, index: true },
    batchNo: { type: String, trim: true },
    maintenanceStatus: {
      type: String,
      enum: ["operational", "under_maintenance", "out_of_service"],
    },
    lastServicedAt: Date,
    nextMaintenanceAt: Date,
    location: { type: String, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

InventoryItemSchema.index({ name: "text", sku: "text" });

export const InventoryItem = mongoose.model<IInventoryItem>(
  "InventoryItem",
  InventoryItemSchema,
);

export default InventoryItem;
