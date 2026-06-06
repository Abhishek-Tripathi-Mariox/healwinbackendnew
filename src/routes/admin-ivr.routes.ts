import { Router } from "express";
import * as C from "../controllers/ivr-escalation.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * IVR escalation — admin management. Mounted at /admin/ivr-escalations.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IVR_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IVR_MANAGE),
  ErrorHandlerMiddleware(C.start),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IVR_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.post(
  "/:id/advance",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IVR_MANAGE),
  ErrorHandlerMiddleware(C.advance),
  ResponseMiddleware,
);

router.post(
  "/:id/acknowledge",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IVR_MANAGE),
  ErrorHandlerMiddleware(C.acknowledge),
  ResponseMiddleware,
);

router.post(
  "/:id/cancel",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IVR_MANAGE),
  ErrorHandlerMiddleware(C.cancel),
  ResponseMiddleware,
);

export default router;
