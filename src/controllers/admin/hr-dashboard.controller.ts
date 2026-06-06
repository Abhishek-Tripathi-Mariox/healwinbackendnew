import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { LeaveRequest } from "../../models/leave-request.model";
import { PayrollRun } from "../../models/payroll-run.model";

/**
 * HR — Dashboard summary cards.
 */
export const summary = async (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    LeaveRequest.countDocuments({ status: "pending" }),
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
    PayrollRun.findOne().sort({ year: -1, month: -1 }).lean(),
  ]);

  _req.rData = {
    headcount,
    activeCount,
    presentToday,
    onLeaveToday,
    pendingLeaves,
    byDepartment,
    latestRun,
  };
  _req.msg = "hr_dashboard";
  return next();
};
