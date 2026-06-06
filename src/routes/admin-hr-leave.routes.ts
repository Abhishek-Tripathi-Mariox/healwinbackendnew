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

export default router;
