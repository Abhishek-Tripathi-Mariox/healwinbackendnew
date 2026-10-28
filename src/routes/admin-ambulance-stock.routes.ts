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

// Declared BEFORE "/:ambulanceId" is irrelevant for POSTs, but kept together
// so the write surface is obvious. Both move real stock, so they need
// INVENTORY_ADJUST — the same gate the ward equivalents use.
router.post(
  "/:ambulanceId/issue",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.issueToAmbulance),
  ResponseMiddleware,
);

router.post(
  "/:ambulanceId/adjust",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.adjustAmbulance),
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
