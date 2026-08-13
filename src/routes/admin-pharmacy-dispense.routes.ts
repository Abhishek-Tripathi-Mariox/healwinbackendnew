import { Router } from "express";
import * as C from "../controllers/admin/pharmacy-dispense.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Pharmacy counter — prescription dispense queue. Mounted at
 * /admin/pharmacy-dispense.
 *
 * Gated on INVENTORY_* rather than a new permission pair: fulfilling a
 * prescription IS an inventory issue (it draws FEFO batches and writes a
 * StockTransaction), so whoever may adjust stock may dispense.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/:id/fulfil",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.fulfil),
  ResponseMiddleware,
);

router.post(
  "/:id/cancel",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.cancel),
  ResponseMiddleware,
);

export default router;
