import { Router } from "express";
import * as C from "../controllers/admin/shift.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();
const auth = AdminAuthMiddleware();

router.post(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.post(
  "/:id/cancel",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.cancel),
  ResponseMiddleware,
);

router.post(
  "/:id/assign",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.assignStaff),
  ResponseMiddleware,
);

router.post(
  "/:id/unassign",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.unassignStaff),
  ResponseMiddleware,
);

export default router;
