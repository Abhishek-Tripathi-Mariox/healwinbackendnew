import { Router } from "express";
import * as C from "../controllers/admin/hms-reports.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Hospital MIS dashboard metrics. Mounted at /admin/hms-reports. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/summary",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_REPORTS),
  ErrorHandlerMiddleware(C.summary),
  ResponseMiddleware,
);

export default router;
