import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { PayrollRun } from "../../models/payroll-run.model";
import AttendanceRegularization from "../../models/attendance-regularization.model";
import CompOff from "../../models/comp-off.model";
import { PERMISSIONS } from "../../models/role.model";
import { getCycleStartDay } from "../../services/payroll-settings.service";
import { payrollPeriod, periodForDate } from "../../services/payroll-period";

/**
 * HR — the dashboard.
 *
 * Headcount/attendance is fine for anyone who can see this page at all (gated
 * by HR_DASHBOARD_VIEW at the route), but leave counts and payroll totals are
 * more sensitive sub-modules with their own permissions — a role with only
 * HR_DASHBOARD_VIEW shouldn't see pending-leave counts or salary spend just
 * because it can load this page.
 *
 * Everything is filterable by department, designation, category, employment
 * type and pay period. The filters are applied inside the database rather than
 * by fetching employees and counting them here: at any real headcount, reading
 * the whole roster to draw a summary card is what stops the page loading.
 */

const dayStart = (d: Date | string = new Date()): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

interface Filters {
  departmentId?: string;
  designationId?: string;
  designationIds?: string[];
  category?: string;
  employmentTypeId?: string;
}

/** The employee-side filter, shared by every count on the page. */
const employeeMatch = (f: Filters): Record<string, unknown> => {
  const q: Record<string, unknown> = { isDeleted: false };
  if (f.departmentId) {
    q.departmentId =
      f.departmentId === "none" ? null : new Types.ObjectId(f.departmentId);
  }
  if (f.designationId) {
    q.designationId =
      f.designationId === "none" ? null : new Types.ObjectId(f.designationId);
  }
  if (f.category) q.category = f.category;
  if (f.employmentTypeId) {
    q.employmentTypeId =
      f.employmentTypeId === "none"
        ? null
        : new Types.ObjectId(f.employmentTypeId);
  }
  return q;
};

const isFiltered = (f: Filters): boolean =>
  !!(f.departmentId || f.designationId || f.category || f.employmentTypeId);

/**
 * Attendance counts for a day (or range), grouped by status.
 *
 * Joins to the employee only when a filter is set — an unfiltered count runs
 * straight off the attendance date index, which is the common case and by far
 * the cheapest.
 */
const attendanceByStatus = async (
  from: Date,
  to: Date,
  f: Filters,
): Promise<Record<string, number>> => {
  const pipeline: any[] = [
    { $match: { date: { $gte: from, $lte: to }, subjectType: "hr_employee" } },
  ];
  if (isFiltered(f)) {
    pipeline.push(
      {
        $lookup: {
          from: "hremployees",
          localField: "employeeId",
          foreignField: "_id",
          as: "emp",
          pipeline: [{ $match: employeeMatch(f) }, { $project: { _id: 1 } }],
        },
      },
      { $match: { "emp.0": { $exists: true } } },
    );
  }
  pipeline.push({ $group: { _id: "$status", n: { $sum: 1 } } });

  const rows = await Attendance.aggregate(pipeline);
  return Object.fromEntries(rows.map((r: any) => [r._id, r.n]));
};

/**
 * Headcount grouped by one reference field, with its name resolved.
 *
 * A breakdown never filters by its OWN field. Narrowing "by department" to the
 * department already selected collapses it to a single row and takes away the
 * only way back out — the breakdown is what you pick the filter from. Every
 * other filter still applies, so "nurses, by department" works as expected.
 */
const breakdownBy = async (
  field: "departmentId" | "designationId" | "employmentTypeId",
  collection: string,
  f: Filters,
) => {
  const scoped = { ...f, [field]: undefined } as Filters;
  const rows = await HrEmployee.aggregate([
    { $match: employeeMatch(scoped) },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    {
      $lookup: {
        from: collection,
        localField: "_id",
        foreignField: "_id",
        as: "ref",
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    {
      $project: {
        count: 1,
        name: { $ifNull: [{ $arrayElemAt: ["$ref.name", 0] }, "Unassigned"] },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]);
  return rows;
};

/** Day-and-month key, so a birthday matches on any year. */
const dayMonth = (d: Date) => ({ d: d.getDate(), m: d.getMonth() + 1 });

/**
 * MongoDB's date operators work in UTC unless told otherwise.
 *
 * Dates here are stored at local midnight, which in IST is 18:30 the previous
 * day in UTC — so `$dayOfMonth` on a birthday of 15 September returned 14, and
 * the greeting appeared a day early (or never, against a local "today").
 * Every date part below is pinned to IST, as the rest of the system is.
 */
const IST = "Asia/Kolkata";
const datePart = (op: "$dayOfMonth" | "$month" | "$year", field: string) =>
  ({ [op]: { date: field, timezone: IST } }) as any;

export const summary = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const today = dayStart();

  const perms: string[] = (req as any).admin?.permissions || [];
  const canSeeLeave = perms.includes(PERMISSIONS.LEAVE_VIEW);
  const canSeePayroll = perms.includes(PERMISSIONS.PAYROLL_VIEW);

  const f: Filters = {
    departmentId: (req.query.departmentId as string) || undefined,
    designationId: (req.query.designationId as string) || undefined,
    category: (req.query.category as string) || undefined,
    employmentTypeId: (req.query.employmentTypeId as string) || undefined,
  };
  const match = employeeMatch(f);

  // The pay period the dashboard reports against. Defaults to the one
  // containing today, which on a 16th-to-15th cycle is NOT the calendar month
  // for half of every month.
  const cycleStartDay = await getCycleStartDay();
  const current = periodForDate(new Date(), cycleStartDay);
  const month = Number(req.query.month) || current.month;
  const year = Number(req.query.year) || current.year;
  const period = payrollPeriod(month, year, cycleStartDay);

  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const [
    headcount,
    activeCount,
    onLeaveStatus,
    todayStatuses,
    lateToday,
    offSiteToday,
    pendingLeaves,
    pendingRegularizations,
    pendingCompOff,
    joiners,
    exits,
    byDepartment,
    byDesignation,
    byEmploymentType,
    byCategory,
    byGender,
    latestRun,
  ] = await Promise.all([
    HrEmployee.countDocuments(match),
    HrEmployee.countDocuments({ ...match, status: "active" }),
    HrEmployee.countDocuments({ ...match, status: "on_leave" }),
    attendanceByStatus(today, endOfToday, f),
    // Late and off-site are flags on the row, not statuses, so they are
    // counted separately rather than inferred from the status breakdown.
    Attendance.countDocuments({
      date: today,
      subjectType: "hr_employee",
      isLate: true,
    }),
    Attendance.countDocuments({
      date: today,
      subjectType: "hr_employee",
      checkInWithinGeofence: false,
    }),
    canSeeLeave
      ? LeaveRequest.countDocuments({ status: "pending" })
      : Promise.resolve(null),
    AttendanceRegularization.countDocuments({ status: "pending" }).catch(() => 0),
    CompOff.countDocuments({ status: "available" }).catch(() => 0),
    // Movement over the period, which is what "new this month" means once the
    // pay cycle is not a calendar month.
    HrEmployee.countDocuments({
      ...match,
      joiningDate: { $gte: period.start, $lte: period.end },
    }),
    HrEmployee.countDocuments({
      ...match,
      exitDate: { $gte: period.start, $lte: period.end },
    }),
    breakdownBy("departmentId", "departments", f),
    breakdownBy("designationId", "designations", f),
    breakdownBy("employmentTypeId", "employmenttypes", f),
    HrEmployee.aggregate([
      { $match: match },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    HrEmployee.aggregate([
      { $match: match },
      { $group: { _id: "$gender", count: { $sum: 1 } } },
    ]),
    canSeePayroll
      ? PayrollRun.findOne().sort({ year: -1, month: -1 }).lean()
      : Promise.resolve(null),
  ]);

  const presentToday = todayStatuses.present || 0;
  const onLeaveToday = todayStatuses.leave || 0;
  const absentToday = todayStatuses.absent || 0;
  const halfDayToday = todayStatuses.half_day || 0;
  const markedToday =
    Object.values(todayStatuses).reduce((a, b) => a + b, 0) || 0;

  /**
   * Celebrations.
   *
   * Matched on day-and-month so a birthday lands every year, which a plain
   * date range cannot do. Limited to the roster in view and to a handful of
   * names — this is a greeting, not a report.
   */
  const { d: td, m: tm } = dayMonth(new Date());
  const celebrationPipeline = (field: "dob" | "joiningDate") => [
    { $match: { ...match, [field]: { $ne: null }, status: { $ne: "terminated" } } },
    {
      $addFields: {
        _d: datePart("$dayOfMonth", `$${field}`),
        _m: datePart("$month", `$${field}`),
      },
    },
    { $match: { _d: td, _m: tm } },
    // A work anniversary only counts from the second year.
    ...(field === "joiningDate"
      ? [
          {
            $match: {
              $expr: {
                $lt: [datePart("$year", "$joiningDate"), new Date().getFullYear()],
              },
            },
          },
        ]
      : []),
    {
      $project: {
        fullName: 1,
        employeeCode: 1,
        [field]: 1,
        years:
          field === "joiningDate"
            ? {
                $subtract: [
                  new Date().getFullYear(),
                  datePart("$year", "$joiningDate"),
                ],
              }
            : "$$REMOVE",
      },
    },
    { $limit: 10 },
  ];

  const [birthdays, anniversaries] = await Promise.all([
    HrEmployee.aggregate(celebrationPipeline("dob") as any),
    HrEmployee.aggregate(celebrationPipeline("joiningDate") as any),
  ]);

  /**
   * A short attendance trend.
   *
   * Seven days rather than thirty on purpose: this reads one row per employee
   * per day, so the span is the cost. A week is enough to see a pattern; a
   * month of it belongs in HR Reports, where it can be waited for.
   */
  const trendFrom = dayStart();
  trendFrom.setDate(trendFrom.getDate() - 6);
  const trendRows = await Attendance.aggregate([
    { $match: { date: { $gte: trendFrom, $lte: endOfToday }, subjectType: "hr_employee" } },
    ...(isFiltered(f)
      ? [
          {
            $lookup: {
              from: "hremployees",
              localField: "employeeId",
              foreignField: "_id",
              as: "emp",
              pipeline: [{ $match: match }, { $project: { _id: 1 } }],
            },
          },
          { $match: { "emp.0": { $exists: true } } },
        ]
      : []),
    {
      $group: {
        _id: { date: "$date", status: "$status" },
        n: { $sum: 1 },
      },
    },
  ]);
  const trendMap = new Map<string, Record<string, number>>();
  for (const r of trendRows as any[]) {
    const key = new Date(r._id.date).toISOString().slice(0, 10);
    const entry = trendMap.get(key) || {};
    entry[r._id.status] = r.n;
    trendMap.set(key, entry);
  }
  const trend: any[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayStart();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const e = trendMap.get(key) || {};
    trend.push({
      date: key,
      present: e.present || 0,
      absent: e.absent || 0,
      leave: e.leave || 0,
      halfDay: e.half_day || 0,
    });
  }

  req.rData = {
    filters: { ...f, month, year },
    period: { month, year, label: period.label, start: period.start, end: period.end },

    headcount,
    activeCount,
    onLeaveStatus,

    // Today at a glance.
    today: {
      present: presentToday,
      absent: absentToday,
      onLeave: onLeaveToday,
      halfDay: halfDayToday,
      late: lateToday,
      offSite: offSiteToday,
      marked: markedToday,
      // Nobody has recorded anything for these people yet — the number HR
      // actually chases at 10am.
      notMarked: Math.max(0, activeCount - markedToday),
    },

    // Kept for the cards that already read these names.
    presentToday,
    onLeaveToday,
    pendingLeaves,

    pending: {
      leaveRequests: pendingLeaves,
      regularizations: pendingRegularizations,
      compOffAvailable: pendingCompOff,
    },

    movement: {
      joiners,
      exits,
      // Exits against the headcount they left from, as a percentage.
      attritionPercent:
        headcount > 0 ? Math.round((exits / headcount) * 1000) / 10 : 0,
    },

    celebrations: { birthdays, anniversaries },

    byDepartment,
    breakdown: {
      byDepartment,
      byDesignation,
      byEmploymentType,
      byCategory: (byCategory as any[]).map((r) => ({
        name: r._id || "Uncategorised",
        count: r.count,
      })),
      byGender: (byGender as any[]).map((r) => ({
        name: r._id || "Not recorded",
        count: r.count,
      })),
    },

    trend,
    latestRun,
  };
  req.msg = "hr_dashboard";
  return next();
};
