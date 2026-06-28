import mongoose, { Schema, Types } from "mongoose";

/**
 * Procurement module.
 *  - Supplier:       a vendor master (with GSTIN/contact)
 *  - PurchaseOrder:  a PO raised on a supplier; "received" acts as the GRN.
 */

export interface ISupplier {
  _id: Types.ObjectId;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const SupplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    gstin: { type: String, trim: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
export const Supplier = mongoose.model<ISupplier>("Supplier", SupplierSchema);

export interface IPOItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}
export type POStatus = "draft" | "ordered" | "received" | "cancelled";
export interface IPurchaseOrder {
  _id: Types.ObjectId;
  poNumber: string; // auto e.g. PO-000123
  supplierId: Types.ObjectId; // ref Supplier
  items: IPOItem[];
  total: number;
  status: POStatus;
  expectedDate?: Date;
  receivedDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
const POItemSchema = new Schema<IPOItem>(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true, default: 0 },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);
const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber: { type: String, required: true, unique: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    items: { type: [POItemSchema], default: [] },
    total: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "ordered", "received", "cancelled"],
      default: "draft",
      index: true,
    },
    expectedDate: Date,
    receivedDate: Date,
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
PurchaseOrderSchema.index({ createdAt: -1 });
export const PurchaseOrder = mongoose.model<IPurchaseOrder>("PurchaseOrder", PurchaseOrderSchema);
