import { Router } from "express";
import * as C from "../controllers/admin/diagnostic.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Doctor Panel / HMS — Lab & Radiology diagnostics (orders + results).
 * Mounted at /admin/diagnostics. Re-uses EMR permissions since diagnostics
 * are part of the clinical record a doctor manages.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_CREATE),
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_UPDATE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.post(
  "/:id/report",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_UPDATE),
  upload.single("file"),
  ErrorHandlerMiddleware(C.addAttachment),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_UPDATE),
  ErrorHandlerMiddleware(C.remove),
  ResponseMiddleware,
);

export default router;
