/**
 * Payroll period.
 *
 * Payroll used to be a calendar month: the 1st to the last day. The hospital
 * runs a 16th-to-15th cycle instead, so the period a run covers no longer
 * matches the month it is named after, and everything downstream — attendance,
 * loss of pay, proration, the payslip header — has to work from the period
 * rather than from the month.
 *
 * Pure functions on purpose: the date arithmetic here decides what people are
 * paid, so it is unit-tested without a database.
 */

/** Local midnight. */
const atMidnight = (y: number, m0: number, d: number): Date =>
  new Date(y, m0, d, 0, 0, 0, 0);

/** Days in a calendar month (month is 1-12). */
export const daysInCalendarMonth = (month: number, year: number): number =>
  new Date(year, month, 0).getDate();

export interface PayrollPeriod {
  /** First day of the period, at 00:00 local. */
  start: Date;
  /** Last day of the period, at 23:59:59.999 local. */
  end: Date;
  /** Inclusive day count — the denominator for proration. */
  totalDays: number;
  /** The month/year the run is filed under. */
  month: number;
  year: number;
  /** Human label, e.g. "16 Sep 2026 – 15 Oct 2026". */
  label: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const fmt = (d: Date) =>
  `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const DAY_MS = 86400000;

/**
 * The period a payroll run covers.
 *
 * `cycleStartDay` 1 gives an ordinary calendar month. Any other value starts
 * the period on that day of the named month and ends the day before the same
 * day of the next month — so 16 gives 16 Sep → 15 Oct for September.
 *
 * The run is named after the month it STARTS in, which is the convention this
 * hospital uses: "September payroll" is the cycle beginning 16 September.
 *
 * A start day past the end of a short month is clamped to that month's last
 * day, so a 31st cycle still produces a valid period in February.
 */
export const payrollPeriod = (
  month: number,
  year: number,
  cycleStartDay = 1,
): PayrollPeriod => {
  const startDay = Math.min(
    Math.max(1, Math.floor(cycleStartDay) || 1),
    31,
  );

  if (startDay === 1) {
    const total = daysInCalendarMonth(month, year);
    const start = atMidnight(year, month - 1, 1);
    const end = atMidnight(year, month - 1, total);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      totalDays: total,
      month,
      year,
      label: `${fmt(start)} – ${fmt(end)}`,
    };
  }

  // Clamp into the named month (e.g. a 31st cycle in February).
  const start = atMidnight(
    year,
    month - 1,
    Math.min(startDay, daysInCalendarMonth(month, year)),
  );

  // Ends the day before the same day-of-month in the following month, clamped
  // the same way so the periods stay contiguous with no gap or overlap.
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = atMidnight(
    nextYear,
    nextMonth - 1,
    Math.min(startDay, daysInCalendarMonth(nextMonth, nextYear)),
  );
  const end = new Date(endExclusive.getTime() - DAY_MS);
  end.setHours(23, 59, 59, 999);

  const totalDays =
    Math.round((atMidnight(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      start.getTime()) / DAY_MS) + 1;

  return {
    start,
    end,
    totalDays,
    month,
    year,
    label: `${fmt(start)} – ${fmt(end)}`,
  };
};

/**
 * Which payroll run a given date falls into.
 *
 * Needed wherever a date has to be filed against a run — crediting a
 * compensatory off, or checking whether an attendance edit lands in a period
 * that has already been finalized.
 */
export const periodForDate = (
  date: Date | string,
  cycleStartDay = 1,
): { month: number; year: number } => {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  const startDay = Math.min(Math.max(1, Math.floor(cycleStartDay) || 1), 31);
  if (startDay === 1) return { month, year };

  // Before the cycle start day, the date belongs to the PREVIOUS month's run.
  const effectiveStart = Math.min(startDay, daysInCalendarMonth(month, year));
  if (day >= effectiveStart) return { month, year };
  return month === 1
    ? { month: 12, year: year - 1 }
    : { month: month - 1, year };
};
