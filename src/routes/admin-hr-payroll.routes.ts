import { Router } from "express";
import * as C from "../controllers/admin/payroll.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HR — Payroll & salary slips. Mounted at /admin/hr/payroll. */
const router = Router();
const auth = AdminAuthMiddleware();

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
