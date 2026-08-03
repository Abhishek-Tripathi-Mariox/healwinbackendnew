import { Router } from "express";
import * as C from "../controllers/admin/inventory.controller";
import * as AC from "../controllers/admin/inventory-adjustment.controller";
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
  "/valuation",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.valuation),
  ResponseMiddleware,
);

router.get(
  "/consumption-report",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.consumptionReport),
  ResponseMiddleware,
);

router.get(
  "/aging-report",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.agingReport),
  ResponseMiddleware,
);

router.get(
  "/adjustment-requests",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(AC.list),
  ResponseMiddleware,
);

router.post(
  "/adjustment-requests/:id/approve",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_APPROVE),
  ErrorHandlerMiddleware(AC.approve),
  ResponseMiddleware,
);

router.post(
  "/adjustment-requests/:id/reject",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_APPROVE),
  ErrorHandlerMiddleware(AC.reject),
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

router.get(
  "/by-sku/:sku",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.bySku),
  ResponseMiddleware,
);

router.get(
  "/:id/batches",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.batches),
  ResponseMiddleware,
);

router.post(
  "/:id/batches/:batchId/writeoff",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.writeOff),
  ResponseMiddleware,
);

export default router;
