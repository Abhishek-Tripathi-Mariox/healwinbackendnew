import { Router } from "express";
import * as C from "../controllers/admin/alerts.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/**
 * Doctor Panel / HMS operational alerts. Mounted at /admin/alerts.
 * Any authenticated admin can read; the header bell polls this.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getAlerts),
  ResponseMiddleware,
);

export default router;
