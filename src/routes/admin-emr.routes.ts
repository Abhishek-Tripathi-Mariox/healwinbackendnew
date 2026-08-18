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
  "/drug-options",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_CREATE),
  ErrorHandlerMiddleware(C.drugOptions),
  ResponseMiddleware,
);
router.get(
  "/lab-test-options",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_CREATE),
  ErrorHandlerMiddleware(C.labTestOptions),
  ResponseMiddleware,
);

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

// NOTE: the old POST /:id/dispense is gone. Prescriptions now flow to the
// Pharmacy Dispense queue (admin-pharmacy-dispense.routes.ts), raised
// automatically when an encounter is finalised. Keeping both meant the same
// prescription could be dispensed twice — once from here, once from the queue —
// decrementing stock twice with nothing linking the two.

router.get(
  "/:id/prescription-pdf",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMR_VIEW),
  ErrorHandlerMiddleware(C.prescriptionPdf),
);

export default router;
