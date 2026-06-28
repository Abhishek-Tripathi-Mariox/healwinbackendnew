import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor duty roster / on-call schedule. One entry = one doctor assigned to a
 * shift on a date (optionally flagged on-call). Drives "who's on duty" views.
 */
export type RosterShift = "morning" | "evening" | "night" | "full";

export interface IDoctorRoster {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId; // ref Admin (Doctor role)
  date: string; // "YYYY-MM-DD"
  shift: RosterShift;
  isOnCall: boolean;
  department?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorRosterSchema = new Schema<IDoctorRoster>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    date: { type: String, required: true, index: true }, // calendar day
    shift: { type: String, enum: ["morning", "evening", "night", "full"], default: "full" },
    isOnCall: { type: Boolean, default: false },
    department: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
// One doctor can't be double-booked into the same shift on the same day.
DoctorRosterSchema.index({ doctorId: 1, date: 1, shift: 1 }, { unique: true });
DoctorRosterSchema.index({ date: 1, shift: 1 });

export const DoctorRoster = mongoose.model<IDoctorRoster>("DoctorRoster", DoctorRosterSchema);
export default DoctorRoster;
