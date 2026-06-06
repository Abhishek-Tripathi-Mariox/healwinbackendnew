import { Router } from "express";
import * as C from "../controllers/admin/ambulance-request.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Admin dispatch for patient ambulance requests. Mounted at /admin/ambulance-requests. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SOS_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);
router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SOS_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);
router.post(
  "/:id/assign",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SOS_RESPOND),
  ErrorHandlerMiddleware(C.assign),
  ResponseMiddleware,
);
router.post(
  "/:id/status",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SOS_RESPOND),
  ErrorHandlerMiddleware(C.updateStatus),
  ResponseMiddleware,
);

export default router;
