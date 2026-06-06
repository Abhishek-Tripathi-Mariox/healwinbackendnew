import { Router } from "express";
import * as TrackingController from "../controllers/tracking.controller";
import AuthMiddleware from "../middlewares/auth.middleware";
import DriverAuthMiddleware from "../middlewares/driver-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";

const router = Router();
const { verifyUserToken } = AuthMiddleware();
const { verifyDriverToken } = DriverAuthMiddleware();

// ===== User Routes =====

/**
 * @route GET /v1/api/tracking/booking/:bookingId
 * @desc Get booking tracking info
 * @access Private (User)
 */
router.get(
  "/booking/:bookingId",
  verifyUserToken,
  ErrorHandlerMiddleware(TrackingController.getBookingTracking),
);

/**
 * @route GET /v1/api/tracking/driver/:driverId
 * @desc Get driver location
 * @access Private (User)
 */
router.get(
  "/driver/:driverId",
  verifyUserToken,
  ErrorHandlerMiddleware(TrackingController.getDriverLocation),
);

/**
 * @route GET /v1/api/tracking/nearby-drivers
 * @desc Get nearby drivers
 * @access Private (User)
 */
router.get(
  "/nearby-drivers",
  verifyUserToken,
  ErrorHandlerMiddleware(TrackingController.getNearbyDrivers),
);

// ===== Driver Routes =====

/**
 * @route PUT /v1/api/tracking/location
 * @desc Update driver location
 * @access Private (Driver)
 */
router.put(
  "/location",
  verifyDriverToken,
  ErrorHandlerMiddleware(TrackingController.updateDriverLocation),
);

/**
 * @route PUT /v1/api/tracking/online-status
 * @desc Set driver online/offline status
 * @access Private (Driver)
 */
router.put(
  "/online-status",
  verifyDriverToken,
  ErrorHandlerMiddleware(TrackingController.setOnlineStatus),
);

export default router;
