import { Router } from "express";
import * as C from "../controllers/admin/hr-reports.controller";
import AuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

const router = Router();
const auth = AuthMiddleware();

/**
 * Each report is gated on the permission for the data it exposes, not on a
 * single blanket "reports" permission — a salary sheet is payroll data
 * whichever screen it is read from.
 */
const gate = (perm: string) => [
  auth.verifyAdminToken,
  auth.requirePermission(perm),
];

router.get("/employees", ...gate(PERMISSIONS.EMPLOYEES_VIEW), ErrorHandlerMiddleware(C.employees), ResponseMiddleware);
router.get("/attendance", ...gate(PERMISSIONS.ATTENDANCE_VIEW), ErrorHandlerMiddleware(C.attendance), ResponseMiddleware);
router.get("/leave", ...gate(PERMISSIONS.LEAVE_VIEW), ErrorHandlerMiddleware(C.leave), ResponseMiddleware);
router.get("/leave-balances", ...gate(PERMISSIONS.LEAVE_VIEW), ErrorHandlerMiddleware(C.leaveBalances), ResponseMiddleware);
router.get("/payroll", ...gate(PERMISSIONS.PAYROLL_VIEW), ErrorHandlerMiddleware(C.payroll), ResponseMiddleware);
router.get("/shifts", ...gate(PERMISSIONS.SHIFTS_VIEW), ErrorHandlerMiddleware(C.shifts), ResponseMiddleware);
router.get("/holidays", ...gate(PERMISSIONS.HOLIDAYS_VIEW), ErrorHandlerMiddleware(C.holidays), ResponseMiddleware);
router.get("/month-days", ...gate(PERMISSIONS.ATTENDANCE_VIEW), ErrorHandlerMiddleware(C.monthDays), ResponseMiddleware);

export default router;
