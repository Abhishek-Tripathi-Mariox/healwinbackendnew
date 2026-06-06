import { Router } from "express";
import * as C from "../controllers/admin/hr-dashboard.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HR — Dashboard. Mounted at /admin/hr/dashboard. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HR_DASHBOARD_VIEW),
  ErrorHandlerMiddleware(C.summary),
  ResponseMiddleware,
);

export default router;
