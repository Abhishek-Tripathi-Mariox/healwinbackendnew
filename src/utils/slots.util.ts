import config from "../config";

/**
 * Appointment time-slot generation. Slots are pinned to IST (+05:30) so they're
 * stable regardless of the server's timezone, matching how the patient (India)
 * experiences them.
 */

export interface Slot {
  time: string; // "09:30" (24h, IST)
  label: string; // "9:30 AM"
  startsAt: Date; // absolute instant for the slot
}

const to12h = (h: number, m: number): string => {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
};

/** Generate the day's slots for a YYYY-MM-DD date (IST working hours). */
export const generateSlots = (dateStr: string): Slot[] => {
  const { workStartHour, workEndHour, slotMinutes } = config.clinic;
  const slots: Slot[] = [];
  for (let mins = workStartHour * 60; mins < workEndHour * 60; mins += slotMinutes) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const startsAt = new Date(`${dateStr}T${time}:00+05:30`);
    if (Number.isNaN(startsAt.getTime())) continue;
    slots.push({ time, label: to12h(h, m), startsAt });
  }
  return slots;
};

/** Resolve a date + "HH:mm" slot into an absolute instant (IST), or null. */
export const slotToDate = (dateStr: string, time: string): Date | null => {
  if (!dateStr || !time) return null;
  const d = new Date(`${dateStr}T${time}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Human label for a stored slot time string ("09:30" → "9:30 AM"). */
export const slotLabelFor = (time: string): string => {
  const [h, m] = (time || "").split(":").map(Number);
  if (Number.isNaN(h)) return time || "";
  return to12h(h, m || 0);
};
