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
    HrEmployee.countDocuments({ isDeleted: false }),
    HrEmployee.countDocuments({ isDeleted: false, status: "active" }),
    Attendance.countDocuments({ date: today, status: "leave" }),
    Attendance.countDocuments({ date: today, status: "present" }),
    canSeeLeave ? LeaveRequest.countDocuments({ status: "pending" }) : Promise.resolve(null),
    HrEmployee.aggregate([
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
