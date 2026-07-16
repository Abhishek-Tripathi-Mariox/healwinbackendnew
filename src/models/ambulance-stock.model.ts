import mongoose, { Schema, Types } from "mongoose";

/**
 * Per-ambulance inventory.
 *
 *  • `AmbulanceStock`            — current on-hand quantity of each InventoryItem
 *                                  ON a given ambulance (unique ambulance+item).
 *  • `AmbulanceStockTransaction` — the movement journal for that stock:
 *      - type "in"  → restocked onto the ambulance (from a fulfilled crew
 *                     stock request); central inventory decreases in parallel.
 *      - type "out" → consumed on a patient during a dispatch; carries the
 *                     patient/dispatch link + billed amount, so we can report
 *                     "kis patient par kitna kharch" and per-ambulance spend.
 */

export interface IAmbulanceStock {
  _id: Types.ObjectId;
  ambulanceId: Types.ObjectId;
  itemId: Types.ObjectId;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const AmbulanceStockSchema = new Schema<IAmbulanceStock>(
  {
    ambulanceId: { type: Schema.Types.ObjectId, ref: "Ambulance", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    quantity: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);
AmbulanceStockSchema.index({ ambulanceId: 1, itemId: 1 }, { unique: true });

export const AmbulanceStock = mongoose.model<IAmbulanceStock>(
  "AmbulanceStock",
  AmbulanceStockSchema,
);

export interface IAmbulanceStockTransaction {
  _id: Types.ObjectId;
  ambulanceId: Types.ObjectId;
  itemId: Types.ObjectId;
  itemName: string;
  type: "in" | "out";
  quantity: number;
  balanceAfter: number; // ambulance on-hand qty after this movement
  unitCost?: number; // hospital cost basis
  sellingPrice?: number; // patient rate
  amount?: number; // qty * sellingPrice — the patient-billed value (for "out")
  reason: "restock" | "consumption" | "adjustment";
  staffId?: Types.ObjectId; // crew who received/consumed
  stockRequestId?: Types.ObjectId; // the fulfilled StaffStockRequest (restock)
  requestId?: Types.ObjectId; // AmbulanceRequest (patient booking)
  dispatchId?: Types.ObjectId; // EmergencyDispatch (SOS)
  patientId?: Types.ObjectId; // HospitalPatient consumed on
  patientName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AmbulanceStockTransactionSchema = new Schema<IAmbulanceStockTransaction>(
  {
    ambulanceId: { type: Schema.Types.ObjectId, ref: "Ambulance", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    itemName: { type: String, required: true },
    type: { type: String, enum: ["in", "out"], required: true, index: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    unitCost: Number,
    sellingPrice: Number,
    amount: Number,
    reason: {
      type: String,
      enum: ["restock", "consumption", "adjustment"],
      default: "consumption",
      index: true,
    },
    staffId: { type: Schema.Types.ObjectId, ref: "AmbulanceStaff" },
    stockRequestId: { type: Schema.Types.ObjectId, ref: "StaffStockRequest" },
    requestId: { type: Schema.Types.ObjectId, ref: "AmbulanceRequest" },
    dispatchId: { type: Schema.Types.ObjectId, ref: "EmergencyDispatch" },
    patientId: { type: Schema.Types.ObjectId, ref: "HospitalPatient", index: true },
    patientName: String,
  },
  { timestamps: true },
);
AmbulanceStockTransactionSchema.index({ ambulanceId: 1, createdAt: -1 });

export const AmbulanceStockTransaction = mongoose.model<IAmbulanceStockTransaction>(
  "AmbulanceStockTransaction",
  AmbulanceStockTransactionSchema,
);
