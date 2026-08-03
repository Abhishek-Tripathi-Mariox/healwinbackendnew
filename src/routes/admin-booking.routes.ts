import { Router } from "express";
import * as C from "../controllers/admin/booking.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Booking management. Mounted at /admin/bookings. Lets admins list/search
 * bookings, view one, manually assign a driver, cancel, and refund. The
 * controller logic already existed but was never routed.
 *
 * Static sub-paths (/drivers, /stats) are declared before /:id so they
 * aren't swallowed by the id param.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  ErrorHandlerMiddleware(C.getAllBookings),
  ResponseMiddleware,
);

router.get(
  "/drivers",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  ErrorHandlerMiddleware(C.getAvailableDrivers),
  ResponseMiddleware,
);

router.get(
  "/stats",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  ErrorHandlerMiddleware(C.getBookingStats),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  ErrorHandlerMiddleware(C.getBookingById),
  ResponseMiddleware,
);

router.post(
  "/:id/assign",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  ErrorHandlerMiddleware(C.assignDriver),
  ResponseMiddleware,
);

router.post(
  "/:id/cancel",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_CANCEL),
  ErrorHandlerMiddleware(C.cancelBooking),
  ResponseMiddleware,
);

router.post(
  "/:id/refund",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BOOKINGS_REFUND),
  ErrorHandlerMiddleware(C.processRefund),
  ResponseMiddleware,
);

export default router;
