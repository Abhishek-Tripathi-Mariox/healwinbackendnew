import { Router } from "express";
import * as C from "../controllers/admin/fleet-health.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Fleet system-health snapshot. Mounted at /admin/fleet-health. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.TRACKING_VIEW),
  ErrorHandlerMiddleware(C.summary),
  ResponseMiddleware,
);

export default router;
