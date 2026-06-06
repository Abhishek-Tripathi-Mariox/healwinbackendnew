import { Router } from "express";
import * as C from "../controllers/admin/dashboard.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/**
 * Admin dashboard. Mounted at /admin/dashboard. Any authenticated admin
 * can read the landing stats.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/stats",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getStats),
  ResponseMiddleware,
);

export default router;
