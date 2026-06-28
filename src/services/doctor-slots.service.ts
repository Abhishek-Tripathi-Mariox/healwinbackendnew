import { Types } from "mongoose";
import DoctorSchedule from "../models/doctor-schedule.model";
import { Appointment } from "../models/appointment.model";

const toMin = (hhmm: string): number => {
  const [h, m] = String(hhmm).split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
};
const pad = (n: number) => String(n).padStart(2, "0");
const fromMin = (mins: number): string => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

export interface DoctorSlot {
  time: string; // "HH:mm"
  iso: string; // full ISO datetime for the given date
}

/**
 * Available OPD slots for a doctor on a calendar date: weekly window(s) for that
 * weekday, stepped by slotMinutes, minus already-booked (non-cancelled)
 * appointments and minus times already in the past for today.
 */
export const getDoctorSlots = async (
  doctorId: Types.ObjectId | string,
  date: Date,
): Promise<DoctorSlot[]> => {
  const schedule: any = await DoctorSchedule.findOne({ doctorId, isActive: true }).lean();
  if (!schedule || !Array.isArray(schedule.windows) || schedule.windows.length === 0) return [];

  const weekday = date.getDay();
  const step = schedule.slotMinutes || 15;
  const windows = schedule.windows.filter((w: any) => w.weekday === weekday);
  if (windows.length === 0) return [];

  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

  // Times already booked that day (by minute-of-day), excluding cancelled.
  const booked: any[] = await Appointment.find({
    doctorId,
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
    status: { $ne: "cancelled" },
  })
    .select("scheduledAt")
    .lean();
  const taken = new Set(
    booked.map((b) => {
      const d = new Date(b.scheduledAt);
      return d.getHours() * 60 + d.getMinutes();
    }),
  );

  const now = new Date();
  const isToday = dayStart.toDateString() === now.toDateString();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots: DoctorSlot[] = [];
  for (const w of windows) {
    const startM = toMin(w.start);
    const endM = toMin(w.end);
    for (let t = startM; t + step <= endM; t += step) {
      if (taken.has(t)) continue;
      if (isToday && t <= nowMin) continue;
      const iso = new Date(dayStart);
      iso.setHours(Math.floor(t / 60), t % 60, 0, 0);
      slots.push({ time: fromMin(t), iso: iso.toISOString() });
    }
  }
  return slots;
};

/** True if `when` falls on an available slot for the doctor (booking guard). */
export const isSlotAvailable = async (
  doctorId: Types.ObjectId | string,
  when: Date,
): Promise<boolean> => {
  const slots = await getDoctorSlots(doctorId, when);
  const wantMin = when.getHours() * 60 + when.getMinutes();
  return slots.some((s) => toMin(s.time) === wantMin);
};

export default { getDoctorSlots, isSlotAvailable };
