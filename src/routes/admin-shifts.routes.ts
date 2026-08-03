import { Router } from "express";
import * as C from "../controllers/admin/shift.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.AMBULANCE_SHIFTS_VIEW);
const manage = auth.requirePermission(PERMISSIONS.AMBULANCE_SHIFTS_MANAGE);

router.post(
  "/",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.post(
  "/:id/cancel",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.cancel),
  ResponseMiddleware,
);

router.post(
  "/:id/assign",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.assignStaff),
  ResponseMiddleware,
);

router.post(
  "/:id/unassign",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.unassignStaff),
  ResponseMiddleware,
);

export default router;
