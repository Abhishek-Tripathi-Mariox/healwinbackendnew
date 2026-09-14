import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { PayrollRun } from "../../models/payroll-run.model";
import { PERMISSIONS } from "../../models/role.model";

/**
 * HR — Dashboard summary cards.
 *
 * Headcount/attendance is fine for anyone who can see this page at all
 * (gated by HR_DASHBOARD_VIEW at the route), but leave counts and payroll
 * totals are more sensitive sub-modules with their own permissions — a
 * role with only HR_DASHBOARD_VIEW (no LEAVE_VIEW/PAYROLL_VIEW) shouldn't
 * see pending-leave counts or salary spend just because it can load this page.
 */
export const summary = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /**
   * Optional department scope.
   *
   * HR runs a department at a time — "how many of MY nurses are in today" is
   * the question, and a hospital-wide number does not answer it. Attendance
   * and leave are keyed by employee, not department, so those counts are
   * narrowed by first resolving the department's employees.
   */
  const departmentId = req.query.departmentId as string | undefined;
  const scoped = !!departmentId;
  const employeeFilter: any = { isDeleted: false };
  if (scoped) {
    employeeFilter.departmentId = departmentId === "none" ? null : departmentId;
  }

  // Only needed when scoped; hospital-wide counts use the collection directly.
  const scopedIds = scoped
    ? (await HrEmployee.find(employeeFilter).select("_id").lean()).map(
        (e: any) => e._id,
      )
    : null;
  const attendanceScope = scopedIds ? { employeeId: { $in: scopedIds } } : {};

  const perms: string[] = (req as any).admin?.permissions || [];
  const canSeeLeave = perms.includes(PERMISSIONS.LEAVE_VIEW);
  const canSeePayroll = perms.includes(PERMISSIONS.PAYROLL_VIEW);

  const [
    headcount,
    activeCount,
    onLeaveToday,
    presentToday,
    pendingLeaves,
    byDepartment,
    latestRun,
  ] = await Promise.all([
    HrEmployee.countDocuments(employeeFilter),
    HrEmployee.countDocuments({ ...employeeFilter, status: "active" }),
    // Scoped to hr_employee: these sit beside `headcount`, which counts only
    // HrEmployee. Counting ambulance crew here too let "present today" exceed
    // the headcount it is read against.
    Attendance.countDocuments({
      date: today,
      status: "leave",
      subjectType: "hr_employee",
      ...attendanceScope,
    }),
    Attendance.countDocuments({
      date: today,
      status: "present",
      subjectType: "hr_employee",
      ...attendanceScope,
    }),
    canSeeLeave
      ? LeaveRequest.countDocuments({
          status: "pending",
          ...(scopedIds ? { employeeId: { $in: scopedIds } } : {}),
        })
      : Promise.resolve(null),
    HrEmployee.aggregate([
      // The breakdown always covers every department — it is the thing you
      // pick the filter FROM, so narrowing it would remove the way back out.
      { $match: { isDeleted: false } },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "department",
        },
      },
      {
        $project: {
          count: 1,
          name: { $ifNull: [{ $arrayElemAt: ["$department.name", 0] }, "Unassigned"] },
        },
      },
      { $sort: { count: -1 } },
    ]),
    canSeePayroll ? PayrollRun.findOne().sort({ year: -1, month: -1 }).lean() : Promise.resolve(null),
  ]);

  req.rData = {
    departmentId: departmentId || null,
    headcount,
    activeCount,
    presentToday,
    onLeaveToday,
    pendingLeaves,
    byDepartment,
    latestRun,
  };
  req.msg = "hr_dashboard";
  return next();
};
