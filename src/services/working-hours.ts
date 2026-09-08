/**
 * HR — Working hours & overtime (§5).
 *
 * Pure functions over "HH:mm" clock strings and a shift definition. Kept free
 * of Mongoose so the arithmetic — which decides what people are paid — can be
 * tested directly.
 *
 * Everything is in MINUTES since midnight, local (IST) clock. A shift or a
 * worked span that ends at or before it starts has crossed midnight; that is
 * the normal case for the 7 PM–7 AM night shift, not an error.
 */

export interface ShiftTiming {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  breakMinutes?: number;
  graceMinutes?: number;
  fullDayMinutes?: number;
  halfDayMinutes?: number;
  overtimeAfterMinutes?: number;
}

const MINUTES_IN_DAY = 1440;

/** "09:30" → 570. Returns null for anything that isn't a valid clock time. */
export const parseHHmm = (value?: string | null): number | null => {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

/** 570 → "09:30". */
export const formatHHmm = (minutes: number): string => {
  const m = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** True when the shift runs past midnight (7 PM → 7 AM). */
export const isOvernightShift = (shift: ShiftTiming): boolean => {
  const s = parseHHmm(shift.startTime);
  const e = parseHHmm(shift.endTime);
  if (s == null || e == null) return false;
  return e <= s;
};

/**
 * Paid length of the shift itself, break excluded. A 7 PM–7 AM shift with a
 * 60-minute break is 11 paid hours.
 */
export const shiftLengthMinutes = (shift: ShiftTiming): number => {
  const s = parseHHmm(shift.startTime);
  const e = parseHHmm(shift.endTime);
  if (s == null || e == null) return 0;
  const span = e > s ? e - s : e + MINUTES_IN_DAY - s;
  return Math.max(0, span - (shift.breakMinutes || 0));
};

/**
 * Minutes actually worked between two punches, break excluded.
 *
 * A check-out at or before the check-in is read as the next day (a night shift
 * that started at 19:00 and ended at 07:00), NOT as negative time.
 * Returns null when either punch is missing or unparseable — the caller must
 * distinguish "worked nothing" from "we don't know", because the second is a
 * missed punch and belongs in regularization, not in someone's pay.
 */
export const computeWorkedMinutes = (
  checkIn?: string | null,
  checkOut?: string | null,
  shift?: ShiftTiming,
): number | null => {
  const a = parseHHmm(checkIn);
  const b = parseHHmm(checkOut);
  if (a == null || b == null) return null;
  const span = b > a ? b - a : b + MINUTES_IN_DAY - a;
  return Math.max(0, span - (shift?.breakMinutes || 0));
};

/**
 * Overtime for a day.
 *
 * Overtime begins only once the overrun passes the shift's
 * `overtimeAfterMinutes` buffer — a few minutes past the end of a shift is
 * not overtime. Once it does pass, the WHOLE overrun counts, which is what
 * "overtime after 30 minutes" means to the person working it.
 */
export const computeOvertimeMinutes = (
  workedMinutes: number,
  shift: ShiftTiming,
): number => {
  const length = shiftLengthMinutes(shift);
  if (length <= 0) return 0;
  const overrun = workedMinutes - length;
  const buffer = shift.overtimeAfterMinutes ?? 0;
  return overrun >= buffer && overrun > 0 ? Math.round(overrun) : 0;
};

/** Arrived later than the shift start plus its grace period. */
export const isLateArrival = (
  checkIn: string | null | undefined,
  shift: ShiftTiming,
): boolean => {
  const inMin = parseHHmm(checkIn);
  const start = parseHHmm(shift.startTime);
  if (inMin == null || start == null) return false;
  const grace = shift.graceMinutes ?? 0;
  // Compare on the shift's own clock: a night-shift punch just after midnight
  // is early for a 19:00 start, not 19 hours late.
  let diff = inMin - start;
  if (diff < -MINUTES_IN_DAY / 2) diff += MINUTES_IN_DAY;
  if (diff > MINUTES_IN_DAY / 2) diff -= MINUTES_IN_DAY;
  return diff > grace;
};

export type DerivedDayStatus = "present" | "half_day" | "absent";

/**
 * What the hours say the day was worth. Advisory: HR's marked status still
 * wins — this is what the attendance screen offers and what a day with punches
 * but no explicit status falls back to.
 */
export const deriveDayStatus = (
  workedMinutes: number,
  shift: ShiftTiming,
): DerivedDayStatus => {
  const full = shift.fullDayMinutes ?? Math.max(1, shiftLengthMinutes(shift));
  const half = shift.halfDayMinutes ?? Math.floor(full / 2);
  if (workedMinutes >= full) return "present";
  if (workedMinutes >= half) return "half_day";
  return "absent";
};

/** Everything a single day's punches yield, in one call. */
export interface DayComputation {
  workedMinutes: number;
  overtimeMinutes: number;
  isLate: boolean;
  derivedStatus: DerivedDayStatus;
}

export const computeDay = (
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  shift: ShiftTiming,
): DayComputation | null => {
  const worked = computeWorkedMinutes(checkIn, checkOut, shift);
  if (worked == null) return null;
  return {
    workedMinutes: worked,
    overtimeMinutes: computeOvertimeMinutes(worked, shift),
    isLate: isLateArrival(checkIn, shift),
    derivedStatus: deriveDayStatus(worked, shift),
  };
};

/** Minutes → "7h 30m", for screens and payslips. */
export const formatDuration = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
