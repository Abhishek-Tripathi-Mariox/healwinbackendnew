import { Router } from "express";
import * as C from "../controllers/admin/ambulance-stock.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Ambulance inventory — per-vehicle on-hand stock + spend reports.
 * Mounted at /admin/ambulance-stock.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/reports",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.reports),
  ResponseMiddleware,
);

router.get(
  "/:ambulanceId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.ambulanceStock),
  ResponseMiddleware,
);

export default router;
