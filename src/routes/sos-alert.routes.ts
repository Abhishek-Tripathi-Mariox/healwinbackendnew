import { Router } from "express";
import * as C from "../controllers/admin/sos-alert.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();
const auth = AdminAuthMiddleware();

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

router.post(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.post(
  "/:id/status",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.updateStatus),
  ResponseMiddleware,
);

export default router;
