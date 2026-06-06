import mongoose, { Schema, Document } from "mongoose";

/**
 * Audit row written every time a staff member toggles duty. Captures the
 * selected off-duty reason (snapshotting the label so renames on the
 * master list don't rewrite history) so admins can review patterns.
 */
export interface IDutyEvent extends Document {
  staffId: mongoose.Types.ObjectId;
  providerId?: mongoose.Types.ObjectId;
  type: "on_duty" | "off_duty";
  reasonId?: mongoose.Types.ObjectId;
  reasonLabel?: string;
  notes?: string;
  at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DutyEventSchema = new Schema<IDutyEvent>(
  {
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceServiceProvider",
      index: true,
    },
    type: {
      type: String,
      enum: ["on_duty", "off_duty"],
      required: true,
      index: true,
    },
    reasonId: { type: Schema.Types.ObjectId, ref: "OffDutyReason" },
    reasonLabel: String,
    notes: { type: String, trim: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

DutyEventSchema.index({ staffId: 1, at: -1 });

export default mongoose.model<IDutyEvent>("DutyEvent", DutyEventSchema);
