import mongoose, { Schema } from "mongoose";
import { IShift } from "../interfaces/shift";

const ShiftSchema = new Schema<IShift>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceServiceProvider",
      required: true,
      index: true,
    },
    ambulanceId: {
      type: Schema.Types.ObjectId,
      ref: "Ambulance",
      required: true,
      index: true,
    },
    // Nullable — see interfaces/shift.ts. An "open" shift has no
    // staffId; admin assigns one later via /admin/shifts/:id/assign.
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceStaff",
      default: null,
      index: true,
    },
    role: {
      type: String,
      enum: ["driver", "attendant"],
      required: true,
    },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["scheduled", "active", "completed", "cancelled", "missed"],
      default: "scheduled",
      index: true,
    },
    clockInAt: Date,
    clockOutAt: Date,
    notes: { type: String, trim: true },
    cancelReason: { type: String, trim: true },
    recurrenceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// Query patterns the state machine + dispatch + admin UI all hit:
//
//   1. "What shifts are active right now for ambulance X?" — used by the
//      dispatch nearby-ambulance query.
ShiftSchema.index({ ambulanceId: 1, status: 1, startAt: 1 });
//   2. "What shifts does staff member Y have, ordered by start?" — driver
//      app's My Shifts tab.
ShiftSchema.index({ staffId: 1, startAt: -1 });
//   3. "Scheduled shifts whose startAt <= now" — state machine sweep.
ShiftSchema.index({ status: 1, startAt: 1 });
//   4. "Active shifts whose endAt <= now" — state machine completion sweep.
ShiftSchema.index({ status: 1, endAt: 1 });
//   5. Conflict detection: same staff + overlapping time window. Mongo
//      can't enforce range-overlap uniqueness natively, so the create
//      controller runs an explicit overlap query before insert.

export const Shift = mongoose.model<IShift>("Shift", ShiftSchema);
export default Shift;
