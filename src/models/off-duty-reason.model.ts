import mongoose, { Schema, Document } from "mongoose";

/**
 * Admin-managed list of reasons a driver/attendant may select when going
 * off duty. The driver app fetches the active list on demand and the
 * selected `_id` + label is captured on the resulting [[DutyEvent]] so
 * later ops reports can group by reason even if the master list changes.
 */
export interface IOffDutyReason extends Document {
  label: string;
  isActive: boolean;
  sortOrder: number;
  createdByAdminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OffDutyReasonSchema = new Schema<IOffDutyReason>(
  {
    label: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

OffDutyReasonSchema.index(
  { label: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

export default mongoose.model<IOffDutyReason>(
  "OffDutyReason",
  OffDutyReasonSchema,
);
