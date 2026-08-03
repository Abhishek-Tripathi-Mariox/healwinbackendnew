import { Router } from "express";
import * as C from "../controllers/admin/dashboard.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Admin dashboard. Mounted at /admin/dashboard. Any admin with basic
 * dashboard access can read the landing stats (virtually every role has
 * DASHBOARD_VIEW — this is mostly a consistency/defense-in-depth gate).
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/stats",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  ErrorHandlerMiddleware(C.getStats),
  ResponseMiddleware,
);

export default router;
