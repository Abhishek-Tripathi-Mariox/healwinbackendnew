import { Router } from "express";
import * as C from "../controllers/admin/inventory.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Doctor Panel / HMS — Inventory Management. Mounted at /admin/inventory.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/alerts",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.alerts),
  ResponseMiddleware,
);

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_CREATE),
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_UPDATE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_DELETE),
  ErrorHandlerMiddleware(C.remove),
  ResponseMiddleware,
);

router.post(
  "/:id/adjust",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.adjust),
  ResponseMiddleware,
);

export default router;
