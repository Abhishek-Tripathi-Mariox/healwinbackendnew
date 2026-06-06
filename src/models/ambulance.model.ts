import mongoose, { Schema } from "mongoose";
import { IAmbulance } from "../interfaces/ambulance";

const AmbulanceSchema = new Schema<IAmbulance>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceServiceProvider",
      required: true,
      index: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      uppercase: true,
      unique: true,
      trim: true,
    },
    // Free-form so admins can add custom types from the Types & Pricing
    // page, while the standard clinical types (BLS/ALS/ICU/PTV) remain
    // valid. Dispatch logic doesn't branch on the value — it's carried
    // through for display/filtering only.
    ambulanceType: {
      type: String,
      required: true,
      trim: true,
    },
    equipment: [{ type: String, trim: true }],
    fuelType: { type: String, enum: ["Petrol", "Diesel", "CNG", "EV"] },
    rcFrontImage: String,
    rcBackImage: String,
    assignedDriverId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      default: null,
    },
    assignedAttendantId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      default: null,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: { type: [Number], default: [0, 0] },
    },
    lastLocationAt: Date,
    status: {
      type: String,
      enum: ["available", "on_dispatch", "offline", "maintenance"],
      default: "offline",
      index: true,
    },
    currentDispatchId: {
      type: Schema.Types.ObjectId,
      ref: "EmergencyDispatch",
      default: null,
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

AmbulanceSchema.index({ currentLocation: "2dsphere" });
AmbulanceSchema.index({ status: 1, isActive: 1 });
// Historical note: this model used to enforce uniqueness on assignedDriverId
// and assignedAttendantId via unique partial indexes. That made permanent
// 1:1 assignment a database invariant — and made shift-based rotation
// (MOM §5) impossible: the same staff member could not appear on two
// ambulances on different days. The unique constraint has been removed and
// these fields are now a denormalised cache of the currently-ACTIVE
// Shift's staff, maintained by `services/shift-state-machine.service.ts`.
// Admins do not write these fields directly — they create / edit Shift
// documents and the state machine propagates.
//
// If you are running this against an existing database that still has the
// old unique indexes, drop them once with:
//   db.ambulances.dropIndex("assignedDriverId_1");
//   db.ambulances.dropIndex("assignedAttendantId_1");
AmbulanceSchema.index({ assignedDriverId: 1 });
AmbulanceSchema.index({ assignedAttendantId: 1 });

export default mongoose.model<IAmbulance>("Ambulance", AmbulanceSchema);
