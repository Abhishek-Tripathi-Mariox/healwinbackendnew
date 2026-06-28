import { Router } from "express";
import * as C from "../controllers/admin/staff-directory.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Unified staff directory (all roles). Mounted at /admin/staff-directory. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);
router.get(
  "/attendance",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  ErrorHandlerMiddleware(C.attendance),
  ResponseMiddleware,
);

export default router;
