import { Router } from "express";
import * as C from "../controllers/admin/booking.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

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
  ErrorHandlerMiddleware(C.getAllBookings),
  ResponseMiddleware,
);

router.get(
  "/drivers",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getAvailableDrivers),
  ResponseMiddleware,
);

router.get(
  "/stats",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getBookingStats),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getBookingById),
  ResponseMiddleware,
);

router.post(
  "/:id/assign",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.assignDriver),
  ResponseMiddleware,
);

router.post(
  "/:id/cancel",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.cancelBooking),
  ResponseMiddleware,
);

router.post(
  "/:id/refund",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.processRefund),
  ResponseMiddleware,
);

export default router;
