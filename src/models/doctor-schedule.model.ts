import mongoose, { Schema, Types } from "mongoose";

/**
 * Per-doctor weekly availability driving OPD appointment slots. One document per
 * doctor (Admin with role "Doctor"). The patient app generates bookable slots
 * for a chosen date from the matching weekday window(s) minus already-booked
 * appointments — so double-booking is impossible and bookings respect the
 * doctor's real working hours. Admin manages this from the Doctor Schedule page.
 */

export interface IDayWindow {
  weekday: number; // 0 = Sunday … 6 = Saturday
  start: string; // "HH:mm" (24h)
  end: string; // "HH:mm"
}

export interface IDoctorSchedule {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId; // ref Admin (Doctor role)
  slotMinutes: number; // appointment length, e.g. 15
  windows: IDayWindow[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DayWindowSchema = new Schema<IDayWindow>(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    start: { type: String, required: true }, // "09:00"
    end: { type: String, required: true }, // "13:00"
  },
  { _id: false },
);

const DoctorScheduleSchema = new Schema<IDoctorSchedule>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Admin", required: true, unique: true, index: true },
    slotMinutes: { type: Number, default: 15, min: 5, max: 120 },
    windows: { type: [DayWindowSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const DoctorSchedule = mongoose.model<IDoctorSchedule>("DoctorSchedule", DoctorScheduleSchema);
export default DoctorSchedule;
