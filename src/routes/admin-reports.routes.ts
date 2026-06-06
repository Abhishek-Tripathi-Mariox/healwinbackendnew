import { Router } from "express";
import * as C from "../controllers/admin/reports.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Analytics / Reports. Mounted at /admin/reports.
 *
 * Surfaces the operational report aggregations (bookings, revenue, users,
 * drivers). Every endpoint accepts ?dateFrom=&dateTo= (ISO dates); the
 * bookings endpoint also accepts ?groupBy=hour|day|week|month. All are
 * gated by the REPORTS_VIEW permission. The controllers set
 * res.locals.data, which ErrorHandlerMiddleware sends as { success, data }.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/bookings",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.REPORTS_VIEW),
  ErrorHandlerMiddleware(C.getBookingReports),
  ResponseMiddleware,
);

router.get(
  "/revenue",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.REPORTS_VIEW),
  ErrorHandlerMiddleware(C.getRevenueReports),
  ResponseMiddleware,
);

router.get(
  "/users",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.REPORTS_VIEW),
  ErrorHandlerMiddleware(C.getUserReports),
  ResponseMiddleware,
);

router.get(
  "/drivers",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.REPORTS_VIEW),
  ErrorHandlerMiddleware(C.getDriverReports),
  ResponseMiddleware,
);

export default router;
