import { Router } from "express";
import * as C from "../controllers/admin/people.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Everyone who works for HealWin, across HR records, ambulance crew, panel
 * admins and ride drivers. Mounted at /admin/people.
 *
 * Read-only: each row says which module owns it, and edits go to that
 * module's own endpoint so its rules still apply.
 */
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
  "/counts",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  ErrorHandlerMiddleware(C.counts),
  ResponseMiddleware,
);

export default router;
