import { Router } from "express";
import * as C from "../controllers/admin/billing.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Doctor Panel / HMS — Billing Management. Mounted at /admin/billing.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/reports",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_REPORTS),
  ErrorHandlerMiddleware(C.reports),
  ResponseMiddleware,
);

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_CREATE),
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

// Cross-module auto-generated invoice (bed charges / diagnostics / consultation)
router.post(
  "/generate",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_CREATE),
  ErrorHandlerMiddleware(C.generate),
  ResponseMiddleware,
);

// PDFs stream the response directly (no ResponseMiddleware).
router.get(
  "/:id/pdf",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_VIEW),
  ErrorHandlerMiddleware(C.invoicePdf),
);
router.get(
  "/:id/receipt",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_VIEW),
  ErrorHandlerMiddleware(C.receiptPdf),
);
router.get(
  "/:id/audits",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_VIEW),
  ErrorHandlerMiddleware(C.auditTrail),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_UPDATE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.post(
  "/:id/payment",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_PAYMENT),
  ErrorHandlerMiddleware(C.recordPayment),
  ResponseMiddleware,
);

router.post(
  "/:id/refund",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_REFUND),
  ErrorHandlerMiddleware(C.refund),
  ResponseMiddleware,
);

router.post(
  "/:id/advance",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BILLING_PAYMENT),
  ErrorHandlerMiddleware(C.recordAdvance),
  ResponseMiddleware,
);

export default router;
