import { Router } from "express";
import * as C from "../controllers/admin/attendance.controller";
import * as AR from "../controllers/admin/attendance-regularization.controller";
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

// Fill the month's holidays into attendance (§7).
router.post(
  "/apply-holidays",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  ErrorHandlerMiddleware(C.applyHolidays),
  ResponseMiddleware,
);

// ---- Regularization (§4.5) ----
router.get(
  "/regularizations",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_VIEW),
  ErrorHandlerMiddleware(AR.list),
  ResponseMiddleware,
);
router.post(
  "/regularizations",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  ErrorHandlerMiddleware(AR.create),
  ResponseMiddleware,
);
// Deciding one rewrites a past day, and therefore someone's pay.
router.post(
  "/regularizations/:id/approve",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_APPROVE),
  ErrorHandlerMiddleware(AR.approve),
  ResponseMiddleware,
);
router.post(
  "/regularizations/:id/reject",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.ATTENDANCE_APPROVE),
  ErrorHandlerMiddleware(AR.reject),
  ResponseMiddleware,
);

export default router;
