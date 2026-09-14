import { Router } from "express";
import * as C from "../controllers/admin/comp-off.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * HR — compensatory off. Mounted at /admin/hr/comp-off.
 *
 * Granted against leave permissions: a comp-off is leave the employee is owed,
 * and whoever can approve leave is who should be handing them out.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/worked",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.worked),
  ResponseMiddleware,
);

router.get(
  "/balance/:employeeId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.balance),
  ResponseMiddleware,
);

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_APPROVE),
  ErrorHandlerMiddleware(C.grant),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_APPROVE),
  ErrorHandlerMiddleware(C.cancel),
  ResponseMiddleware,
);

export default router;
