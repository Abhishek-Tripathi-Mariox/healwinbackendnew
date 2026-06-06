import { Router } from "express";
import * as C from "../controllers/admin/hospital-patient.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Doctor Panel / HMS — Patient Registration & Demographics.
 * Mounted at /admin/patients.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HMS_PATIENTS_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HMS_PATIENTS_CREATE),
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HMS_PATIENTS_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HMS_PATIENTS_UPDATE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HMS_PATIENTS_DELETE),
  ErrorHandlerMiddleware(C.remove),
  ResponseMiddleware,
);

router.post(
  "/:id/documents",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.HMS_PATIENTS_UPDATE),
  upload.single("file"),
  ErrorHandlerMiddleware(C.addDocument),
  ResponseMiddleware,
);

export default router;
