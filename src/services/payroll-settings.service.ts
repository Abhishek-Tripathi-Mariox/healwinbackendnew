import PayrollSettings from "../models/payroll-settings.model";

/**
 * The payroll cycle start day.
 *
 * Read on nearly every payroll and attendance call, so it is cached briefly
 * rather than fetched each time — but only briefly, so a change made in the
 * admin panel takes effect without a restart.
 */

const TTL_MS = 60_000;
let cached: { value: number; at: number } | null = null;

/** Default when nothing has been configured: the hospital's 16th-to-15th cycle. */
export const DEFAULT_CYCLE_START_DAY = 16;

export const getCycleStartDay = async (): Promise<number> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const row = await PayrollSettings.findOne().lean().catch(() => null);
  const value = row?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY;
  cached = { value, at: Date.now() };
  return value;
};

export const setCycleStartDay = async (
  day: number,
  updatedBy?: string,
): Promise<number> => {
  const value = Math.min(31, Math.max(1, Math.floor(day)));
  const existing = await PayrollSettings.findOne();
  if (existing) {
    existing.cycleStartDay = value;
    if (updatedBy) existing.updatedBy = updatedBy as any;
    await existing.save();
  } else {
    await PayrollSettings.create({ cycleStartDay: value, updatedBy });
  }
  cached = { value, at: Date.now() };
  return value;
};

/** Drop the cache — used by tests and after a direct write. */
export const resetCycleCache = (): void => {
  cached = null;
};
