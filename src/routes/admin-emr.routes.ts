import { Router } from "express";
import * as C from "../controllers/admin/emr.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Doctor Panel / HMS — EMR (SOAP) encounters.
 * Mounted at /admin/emr.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/patient/:patientId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_VIEW),
  ErrorHandlerMiddleware(C.listByPatient),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_CREATE),
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_UPDATE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

// Dispense an encounter's prescriptions into pharmacy inventory (stock-out).
// Requires inventory-adjust since it mutates stock levels.
router.post(
  "/:id/dispense",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  ErrorHandlerMiddleware(C.dispense),
  ResponseMiddleware,
);

export default router;
