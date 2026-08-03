import { Router } from "express";
import * as C from "../controllers/admin/ward-stock.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Ward inventory — per-ward on-hand stock, issued from central inventory,
 * plus consumption/wastage logging. Mounted at /admin/ward-stock.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.reports),
  ResponseMiddleware,
);

router.get(
  "/catalog/items",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.catalogItems),
  ResponseMiddleware,
);

router.get(
  "/:wardId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.wardStock),
  ResponseMiddleware,
);

router.post(
  "/:wardId/issue",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.issue),
  ResponseMiddleware,
);

router.post(
  "/:wardId/adjust",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.adjust),
  ResponseMiddleware,
);

router.post(
  "/:wardId/transfer",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.transfer),
  ResponseMiddleware,
);

export default router;
