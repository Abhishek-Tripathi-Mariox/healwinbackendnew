import mongoose, { Schema, Types } from "mongoose";

/**
 * Pharmacy dispense request — the hand-off between the doctor and the pharmacy
 * counter.
 *
 * When a doctor finalises an encounter with prescriptions, one of these is
 * raised and lands in the pharmacy queue. The counter fulfils it, which draws
 * the medicine from HMS inventory (FEFO batches) and writes StockTransaction
 * rows, so prescribing and stock stay in step.
 *
 * A line without `itemId` is a free-typed drug the pharmacy has no stock record
 * for — it is still shown so the counter knows what was prescribed, but nothing
 * is decremented for it.
 */

export interface IDispenseLine {
  itemId?: Types.ObjectId; // ref InventoryItem — absent for free-typed drugs
  drug: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
  quantity: number; // units to hand over
  dispensedQuantity: number; // actually issued (may be short on stock)
}

export interface IPharmacyDispense {
  _id: Types.ObjectId;
  patientId: Types.ObjectId; // ref HospitalPatient
  encounterId?: Types.ObjectId; // ref EmrEncounter
  doctorId?: Types.ObjectId; // ref Admin — who prescribed
  /**
   * The pharmacy filling this. Unset = the hospital's own counter (drawing on
   * HMS inventory); set = a specific partner outlet, whose assigned staff see
   * only their own queue.
   */
  pharmacyId?: Types.ObjectId;
  lines: IDispenseLine[];
  status: "pending" | "partial" | "dispensed" | "cancelled";
  notes?: string;
  dispensedByAdminId?: Types.ObjectId;
  dispensedAt?: Date;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DispenseLineSchema = new Schema<IDispenseLine>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    drug: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true },
    frequency: { type: String, trim: true },
    duration: { type: String, trim: true },
    notes: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    dispensedQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const PharmacyDispenseSchema = new Schema<IPharmacyDispense>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    encounterId: {
      type: Schema.Types.ObjectId,
      ref: "EmrEncounter",
      index: true,
    },
    doctorId: { type: Schema.Types.ObjectId, ref: "Admin", index: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", index: true },
    lines: { type: [DispenseLineSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "partial", "dispensed", "cancelled"],
      default: "pending",
      index: true,
    },
    notes: { type: String, trim: true },
    dispensedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    dispensedAt: Date,
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// Pharmacy queue: oldest pending first.
PharmacyDispenseSchema.index({ status: 1, createdAt: 1 });

export const PharmacyDispense = mongoose.model<IPharmacyDispense>(
  "PharmacyDispense",
  PharmacyDispenseSchema,
);

export default PharmacyDispense;
