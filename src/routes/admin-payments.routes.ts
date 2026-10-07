import { Router } from "express";
import * as C from "../controllers/admin/payment.controller";
import AuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Collected payments + refunds. Mounted at /admin/payments. */
const router = Router();
const auth = AuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYMENTS_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);
router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYMENTS_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);
router.post(
  "/:id/refund",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYMENTS_REFUND),
  ErrorHandlerMiddleware(C.refund),
  ResponseMiddleware,
);

export default router;
