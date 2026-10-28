import { Types } from "mongoose";

import LeaveBalance from "../models/leave-balance.model";
import LeaveRequest from "../models/leave-request.model";
import LeaveType from "../models/leave-type.model";
import HrEmployee from "../models/hr-employee.model";

/**
 * Leave entitlement.
 *
 * A balance row used to appear only the first time someone's leave was
 * approved, seeded from the type's annual quota. Everything else followed
 * from that: an employee who had never taken leave had no balance at all, a
 * joiner in November was credited a full year, nothing was ever carried into
 * the next year, and there was no way to see what anyone was entitled to
 * until they had already used some of it.
 *
 * Entitlement is now worked out explicitly:
 *
 *   allocated      what this year has earned them, accrued and pro-rata
 *   carriedForward what last year left over, capped by the type
 *   used           approved days
 *   balance        allocated + carriedForward − used
 *
 * `used` and `balance` are still maintained transactionally by the approval
 * path; this service owns `allocated` and `carriedForward`.
 */

const round1 = (n: number) => Math.round(n * 2) / 2; // leave is taken in half days

export interface TypeEntitlement {
  leaveTypeId: string;
  code: string;
  name: string;
  isPaid: boolean;
  accrual: "annual" | "monthly";
  annualQuota: number;
  allocated: number;
  carriedForward: number;
  used: number;
  /** Submitted but not yet decided — spoken for, though not yet deducted. */
  pending: number;
  balance: number;
}

/**
 * How much of a type's annual quota an employee has earned by `asOf`.
 *
 * Two things reduce it. A joiner part-way through the year earns only from
 * their joining month — crediting a full year to someone who started in
 * November is how leave registers end up owing days nobody worked for. And a
 * monthly-accrual type earns by completed month rather than all at once.
 *
 * Someone who has left earns nothing after their exit month.
 */
export const earnedDays = (params: {
  annualQuota: number;
  accrual: "annual" | "monthly";
  year: number;
  joiningDate?: Date | null;
  exitDate?: Date | null;
  asOf?: Date;
}): number => {
  const quota = Math.max(0, Number(params.annualQuota) || 0);
  if (!quota) return 0;

  const asOf = params.asOf ?? new Date();
  const yearStart = new Date(params.year, 0, 1);
  const yearEnd = new Date(params.year, 11, 31);

  const joined = params.joiningDate ? new Date(params.joiningDate) : null;
  if (joined && joined > yearEnd) return 0; // not here yet
  const exited = params.exitDate ? new Date(params.exitDate) : null;
  if (exited && exited < yearStart) return 0; // already gone

  // First and last month (1-12) they are on the rolls during this year.
  const firstMonth = joined && joined > yearStart ? joined.getMonth() + 1 : 1;
  const lastOnRoll = exited && exited < yearEnd ? exited.getMonth() + 1 : 12;

  // For a monthly type, only months that have actually finished count. The
  // current month is still being earned.
  const throughMonth =
    params.accrual === "monthly"
      ? asOf.getFullYear() > params.year
        ? 12
        : asOf.getFullYear() < params.year
          ? 0
          : asOf.getMonth() // completed months only: January (0) means none yet
      : 12;

  const monthsOnRoll = Math.max(0, Math.min(lastOnRoll, throughMonth) - firstMonth + 1);
  if (monthsOnRoll <= 0) return 0;
  if (monthsOnRoll >= 12) return quota;
  return round1((quota * monthsOnRoll) / 12);
};

/** Restate `balance` from its parts. The one place that does. */
export const recomputeBalance = (row: {
  allocated?: number;
  carriedForward?: number;
  used?: number;
}): number =>
  round1((row.allocated || 0) + (row.carriedForward || 0) - (row.used || 0));

/**
 * Make sure every active leave type has a balance row for this employee and
 * year, with `allocated` brought up to what they have earned.
 *
 * Safe to run repeatedly — it is how a monthly-accrual type grows through the
 * year. It only ever raises `allocated`: lowering it would retrospectively
 * take away leave someone may already have booked against.
 */
export const syncEntitlement = async (
  employeeId: Types.ObjectId | string,
  year: number,
  asOf: Date = new Date(),
): Promise<number> => {
  const employee: any = await HrEmployee.findById(employeeId)
    .select("joiningDate exitDate")
    .lean();
  if (!employee) return 0;

  const types: any[] = await LeaveType.find({ isActive: true }).lean();
  let touched = 0;

  for (const type of types) {
    const allocated = earnedDays({
      annualQuota: type.annualQuota,
      accrual: type.accrual || "annual",
      year,
      joiningDate: employee.joiningDate,
      exitDate: employee.exitDate,
      asOf,
    });

    const existing: any = await LeaveBalance.findOne({
      employeeId,
      leaveTypeId: type._id,
      year,
    }).lean();

    // Never reduce it — a mid-year quota change must not strand someone who
    // has already booked against the old figure.
    const nextAllocated = Math.max(allocated, existing?.allocated || 0);
    if (existing && existing.allocated === nextAllocated) continue;

    const carriedForward = existing?.carriedForward || 0;
    const used = existing?.used || 0;
    await LeaveBalance.updateOne(
      { employeeId, leaveTypeId: type._id, year },
      {
        $set: {
          allocated: nextAllocated,
          balance: recomputeBalance({ allocated: nextAllocated, carriedForward, used }),
        },
        $setOnInsert: { carriedForward: 0, used: 0 },
      },
      { upsert: true },
    );
    touched += 1;
  }
  return touched;
};

/**
 * The whole picture for one employee: entitlement, what they have taken,
 * what is awaiting a decision, and what is left.
 *
 * `pending` is shown separately rather than deducted. A request that has not
 * been approved has not consumed anything — but an approver about to say yes
 * to five days needs to see the three already in the queue.
 */
export const balanceSheet = async (
  employeeId: Types.ObjectId | string,
  year: number,
): Promise<TypeEntitlement[]> => {
  await syncEntitlement(employeeId, year);

  const [types, rows, pendingAgg] = await Promise.all([
    LeaveType.find({ isActive: true }).sort({ name: 1 }).lean(),
    LeaveBalance.find({ employeeId, year }).lean(),
    LeaveRequest.aggregate([
      {
        $match: {
          employeeId: new Types.ObjectId(String(employeeId)),
          status: "pending",
          fromDate: { $lte: new Date(year, 11, 31, 23, 59, 59) },
          toDate: { $gte: new Date(year, 0, 1) },
        },
      },
      { $group: { _id: "$leaveTypeId", days: { $sum: "$days" } } },
    ]),
  ]);

  const byType = new Map(rows.map((r: any) => [String(r.leaveTypeId), r]));
  const pendingByType = new Map(pendingAgg.map((p: any) => [String(p._id), p.days]));

  return (types as any[]).map((t) => {
    const row: any = byType.get(String(t._id)) || {};
    const allocated = row.allocated || 0;
    const carriedForward = row.carriedForward || 0;
    const used = row.used || 0;
    return {
      leaveTypeId: String(t._id),
      code: t.code,
      name: t.name,
      isPaid: !!t.isPaid,
      accrual: t.accrual || "annual",
      annualQuota: t.annualQuota || 0,
      allocated,
      carriedForward,
      used,
      pending: pendingByType.get(String(t._id)) || 0,
      balance: recomputeBalance({ allocated, carriedForward, used }),
    };
  });
};

/**
 * Close a year and open the next.
 *
 * Unused days roll into the new year for the types that allow it, capped by
 * `maxCarryForward`. Types without carry-forward simply lapse, which is the
 * point of having the flag.
 *
 * Idempotent: it SETS the new year's `carriedForward` rather than adding to
 * it, so running it twice does not double anyone's leave.
 */
export const runRollover = async (params: {
  fromYear: number;
  toYear: number;
  employeeId?: Types.ObjectId | string;
}): Promise<{ employees: number; daysCarried: number }> => {
  const { fromYear, toYear } = params;

  const types: any[] = await LeaveType.find({ isActive: true }).lean();
  const typeById = new Map(types.map((t) => [String(t._id), t]));

  const prior: any[] = await LeaveBalance.find({
    year: fromYear,
    ...(params.employeeId ? { employeeId: params.employeeId } : {}),
  }).lean();

  const employees = new Set<string>();
  let daysCarried = 0;

  for (const row of prior) {
    const type = typeById.get(String(row.leaveTypeId));
    if (!type) continue;

    const leftOver = Math.max(0, recomputeBalance(row));
    const cap = Number(type.maxCarryForward) || 0;
    const carried = !type.carryForward
      ? 0
      : cap > 0
        ? Math.min(leftOver, cap)
        : leftOver;

    const existing: any = await LeaveBalance.findOne({
      employeeId: row.employeeId,
      leaveTypeId: row.leaveTypeId,
      year: toYear,
    }).lean();
    const allocated = existing?.allocated || 0;
    const used = existing?.used || 0;

    await LeaveBalance.updateOne(
      { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, year: toYear },
      {
        $set: {
          carriedForward: carried,
          balance: recomputeBalance({ allocated, carriedForward: carried, used }),
        },
        $setOnInsert: { allocated, used },
      },
      { upsert: true },
    );

    employees.add(String(row.employeeId));
    daysCarried += carried;
  }

  return { employees: employees.size, daysCarried: round1(daysCarried) };
};

export default { earnedDays, recomputeBalance, syncEntitlement, balanceSheet, runRollover };
