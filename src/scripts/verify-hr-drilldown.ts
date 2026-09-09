/**
 * Check that every HR dashboard card drills into a list holding exactly the
 * records its number was counted from. A card that shows 3 and opens a list
 * showing 0 is worse than a card that does not link at all.
 *
 * Usage: npx ts-node src/scripts/verify-hr-drilldown.ts
 */
import mongoose from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Attendance from "../models/attendance.model";
import { LeaveRequest } from "../models/leave-request.model";

const run = async () => {
  await mongoose.connect(config.database.url);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let bad = 0;
  const cmp = (label: string, card: number, list: number) => {
    const same = card === list;
    if (!same) bad++;
    console.log(`  ${same ? "✅" : "❌"} ${label}: card=${card} list=${list}`);
  };

  // Card counts, exactly as hr-dashboard.controller computes them.
  const headcount = await HrEmployee.countDocuments({ isDeleted: false });
  const activeCount = await HrEmployee.countDocuments({ isDeleted: false, status: "active" });
  const presentToday = await Attendance.countDocuments({ date: today, status: "present", subjectType: "hr_employee" });
  const onLeaveToday = await Attendance.countDocuments({ date: today, status: "leave", subjectType: "hr_employee" });
  const pendingLeaves = await LeaveRequest.countDocuments({ status: "pending" });

  console.log("\n── Card → list ──");
  // /admin/employees  (no filter)
  cmp("Total Employees → employees", headcount, await HrEmployee.countDocuments({ isDeleted: false }));
  // /admin/employees?status=active
  cmp("Active → employees?status=active", activeCount, await HrEmployee.countDocuments({ isDeleted: false, status: "active" }));
  // /admin/attendance?date=today&status=present — the page filters the roster
  // client-side, so the comparable figure is today's present marks.
  cmp("Present Today → attendance?status=present", presentToday,
    await Attendance.countDocuments({ date: today, status: "present", subjectType: "hr_employee" }));
  cmp("On Leave Today → attendance?status=leave", onLeaveToday,
    await Attendance.countDocuments({ date: today, status: "leave", subjectType: "hr_employee" }));
  // /admin/leave?status=pending
  cmp("Pending Leave → leave?status=pending", pendingLeaves, await LeaveRequest.countDocuments({ status: "pending" }));

  console.log("\n── Department rows → employees?departmentId=… ──");
  const byDepartment = await HrEmployee.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: "$departmentId", count: { $sum: 1 } } },
  ]);
  for (const d of byDepartment) {
    // `none` is what the link sends for the "Unassigned" group.
    const query: any = { isDeleted: false, departmentId: d._id === null ? null : d._id };
    cmp(`department ${d._id === null ? "none (Unassigned)" : String(d._id)}`, d.count, await HrEmployee.countDocuments(query));
  }

  await mongoose.disconnect();
  console.log(bad ? `\n❌ ${bad} card(s) would land on a different number\n` : "\n✅ every card lands on its own records\n");
  process.exit(bad ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
