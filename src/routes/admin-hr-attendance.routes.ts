import { Router } from "express";
import * as C from "../controllers/admin/attendance.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HR — Attendance. Mounted at /admin/hr/attendance. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_VIEW),
  ErrorHandlerMiddleware(C.byDate),
  ResponseMiddleware,
);

router.get(
  "/summary",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_VIEW),
  ErrorHandlerMiddleware(C.monthlySummary),
  ResponseMiddleware,
);

router.get(
  "/employee/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_VIEW),
  ErrorHandlerMiddleware(C.byEmployeeMonth),
  ResponseMiddleware,
);

router.post(
  "/mark",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  ErrorHandlerMiddleware(C.markBulk),
  ResponseMiddleware,
);

export default router;
