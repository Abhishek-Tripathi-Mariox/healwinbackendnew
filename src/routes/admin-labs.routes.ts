import { Router } from "express";
import * as C from "../controllers/lab.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Diagnostic lab platform — admin management. Mounted at /admin/labs.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LABS_VIEW),
  ErrorHandlerMiddleware(C.adminList),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LABS_CREATE),
  upload.single("image"),
  ErrorHandlerMiddleware(C.adminCreate),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LABS_VIEW),
  ErrorHandlerMiddleware(C.adminDetail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LABS_UPDATE),
  upload.single("image"),
  ErrorHandlerMiddleware(C.adminUpdate),
  ResponseMiddleware,
);

router.post(
  "/:id/approve",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LABS_APPROVE),
  ErrorHandlerMiddleware(C.adminApprove),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LABS_DELETE),
  ErrorHandlerMiddleware(C.adminRemove),
  ResponseMiddleware,
);

export default router;
