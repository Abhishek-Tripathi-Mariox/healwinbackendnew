import { Router } from "express";
import * as C from "../controllers/admin/payment-settings.controller";
import AuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Payment gateway configuration. Mounted at /admin/payment-settings. */
const router = Router();
const auth = AuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYMENT_CONFIG_VIEW),
  ErrorHandlerMiddleware(C.get),
  ResponseMiddleware,
);
router.put(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYMENT_CONFIG_MANAGE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);
router.post(
  "/test",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYMENT_CONFIG_VIEW),
  ErrorHandlerMiddleware(C.test),
  ResponseMiddleware,
);

export default router;
