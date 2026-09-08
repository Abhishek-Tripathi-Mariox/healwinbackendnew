import { Router } from "express";
import * as C from "../controllers/admin/work-shift.controller";
import AuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

const router = Router();
const auth = AuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SHIFTS_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);
router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SHIFTS_MANAGE),
  ErrorHandlerMiddleware(C.save),
  ResponseMiddleware,
);
router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SHIFTS_MANAGE),
  ErrorHandlerMiddleware(C.save),
  ResponseMiddleware,
);
router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SHIFTS_MANAGE),
  ErrorHandlerMiddleware(C.remove),
  ResponseMiddleware,
);

export default router;
