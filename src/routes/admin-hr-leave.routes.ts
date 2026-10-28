import { Router } from "express";
import * as C from "../controllers/admin/leave.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HR — Leave (types, requests, balances). Mounted at /admin/hr/leave. */
const router = Router();
const auth = AdminAuthMiddleware();

// ----- Leave types -----
router.get(
  "/types",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.listTypes),
  ResponseMiddleware,
);
router.post(
  "/types",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_MANAGE),
  ErrorHandlerMiddleware(C.saveType),
  ResponseMiddleware,
);
router.put(
  "/types/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_MANAGE),
  ErrorHandlerMiddleware(C.saveType),
  ResponseMiddleware,
);

// ----- Balances -----
router.get(
  "/balances",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.balances),
  ResponseMiddleware,
);

// ----- Requests -----
router.get(
  "/requests",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.listRequests),
  ResponseMiddleware,
);
router.post(
  "/requests",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_MANAGE),
  ErrorHandlerMiddleware(C.createRequest),
  ResponseMiddleware,
);
router.post(
  "/requests/:id/approve",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_APPROVE),
  ErrorHandlerMiddleware(C.approveRequest),
  ResponseMiddleware,
);
router.post(
  "/requests/:id/reject",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_APPROVE),
  ErrorHandlerMiddleware(C.rejectRequest),
  ResponseMiddleware,
);
// Reversing an approval is an approval-level decision — it hands back balance
// and rewrites attendance — so it sits behind LEAVE_APPROVE, not LEAVE_MANAGE.
router.post(
  "/requests/:id/cancel",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_APPROVE),
  ErrorHandlerMiddleware(C.cancelRequest),
  ResponseMiddleware,
);

/**
 * One employee's leave, end to end — entitlement, used, pending, balance and
 * the year's history. Declared after the other /balances routes so a literal
 * path is never read as an id.
 */
router.get(
  "/employee/:employeeId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_VIEW),
  ErrorHandlerMiddleware(C.employeeLeave),
  ResponseMiddleware,
);

// Both of these change what people are entitled to, so they sit behind
// LEAVE_MANAGE rather than LEAVE_VIEW.
router.post(
  "/balances/sync",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_MANAGE),
  ErrorHandlerMiddleware(C.syncBalances),
  ResponseMiddleware,
);
router.post(
  "/balances/rollover",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.LEAVE_MANAGE),
  ErrorHandlerMiddleware(C.rolloverBalances),
  ResponseMiddleware,
);

export default router;
