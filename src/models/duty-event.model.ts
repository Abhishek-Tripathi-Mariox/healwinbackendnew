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
  // Selfie + GPS captured at the moment of toggling duty, and (where the
  // staff member has a real Centre anchor — see ambulance-staff.controller.ts
  // #setDuty) whether that position was within the geofence. Attendants are
  // anchored to their assigned hospital/Centre; drivers have no such anchor
  // today so these stay unset for them — see the caveat in setDuty.
  photo?: string;
  location?: { lat: number; lng: number };
  distanceMeters?: number;
  withinGeofence?: boolean;
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
    photo: String,
    location: {
      lat: Number,
      lng: Number,
    },
    distanceMeters: Number,
    withinGeofence: Boolean,
  },
  { timestamps: true },
);

DutyEventSchema.index({ staffId: 1, at: -1 });

export default mongoose.model<IDutyEvent>("DutyEvent", DutyEventSchema);
