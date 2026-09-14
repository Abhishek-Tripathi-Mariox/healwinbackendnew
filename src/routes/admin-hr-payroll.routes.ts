import { Router } from "express";
import * as C from "../controllers/admin/payroll.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HR — Payroll & salary slips. Mounted at /admin/hr/payroll. */
const router = Router();
const auth = AdminAuthMiddleware();

// Payroll calendar (the 16th-to-15th cycle). Viewing is part of seeing
// payroll; changing it moves everyone's pay period, so it needs process rights.
router.get(
  "/settings",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_VIEW),
  ErrorHandlerMiddleware(C.settingsGet),
  ResponseMiddleware,
);

router.put(
  "/settings",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_PROCESS),
  ErrorHandlerMiddleware(C.settingsUpdate),
  ResponseMiddleware,
);

router.get(
  "/runs",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_VIEW),
  ErrorHandlerMiddleware(C.runsList),
  ResponseMiddleware,
);

router.post(
  "/generate",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_PROCESS),
  ErrorHandlerMiddleware(C.generate),
  ResponseMiddleware,
);

router.get(
  "/runs/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_VIEW),
  ErrorHandlerMiddleware(C.runDetail),
  ResponseMiddleware,
);

// HR signs the sheet off before it can be locked (§8).
router.post(
  "/runs/:id/verify",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_VERIFY),
  ErrorHandlerMiddleware(C.verify),
  ResponseMiddleware,
);

router.post(
  "/runs/:id/finalize",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_FINALIZE),
  ErrorHandlerMiddleware(C.finalize),
  ResponseMiddleware,
);

router.get(
  "/payslip/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_VIEW),
  ErrorHandlerMiddleware(C.payslipDetail),
  ResponseMiddleware,
);

// Binary PDF — handler writes the response itself (no ResponseMiddleware).
router.get(
  "/payslip/:id/pdf",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.PAYROLL_VIEW),
  ErrorHandlerMiddleware(C.payslipPdf),
);

export default router;
