import mongoose, { Schema, Types } from "mongoose";

/**
 * Hospital / HR staff shift schedule (nurses, ward, OPD/IPD support, etc.).
 * Kept separate from the ambulance-fleet Shift model (which is dispatch-critical
 * and tied to ambulances/providers). One entry = one employee on a shift on a
 * date, optionally scoped to a department/section.
 */
export type EmployeeShiftType = "morning" | "evening" | "night" | "general";

export interface IEmployeeShift {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId; // ref HrEmployee
  date: string; // "YYYY-MM-DD"
  shift: EmployeeShiftType;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  department?: string;
  section?: string; // e.g. "OPD", "IPD-Ward-A", "ICU"
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeShiftSchema = new Schema<IEmployeeShift>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "HrEmployee", required: true, index: true },
    date: { type: String, required: true, index: true },
    shift: { type: String, enum: ["morning", "evening", "night", "general"], default: "general" },
    startTime: String,
    endTime: String,
    department: { type: String, trim: true },
    section: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
// One employee can't be double-booked into the same shift on the same day.
EmployeeShiftSchema.index({ employeeId: 1, date: 1, shift: 1 }, { unique: true });
EmployeeShiftSchema.index({ date: 1, shift: 1 });

export const EmployeeShift = mongoose.model<IEmployeeShift>("EmployeeShift", EmployeeShiftSchema);
export default EmployeeShift;
