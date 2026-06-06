import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";

const { verifyUserToken } = AuthMiddleware();
import { rateLimiters } from "../middlewares/rate-limit.middleware";
import * as bookingController from "../controllers/booking.controller";

const router = Router();

// Apply auth middleware to all routes
router.use(verifyUserToken);

// Fare estimation (before booking)
router.post(
  "/fare-estimate",
  rateLimiters.search,
  bookingController.getFareEstimate,
);

// Create new booking
router.post("/", rateLimiters.booking, bookingController.createBooking);

// Get user's bookings with pagination
router.get("/", bookingController.getUserBookings);

// Get booking by ID
router.get("/:bookingId", bookingController.getBookingById);

// Track active booking
router.get("/:bookingId/track", bookingController.trackBooking);

// Apply promo code
router.post("/:bookingId/apply-promo", bookingController.applyPromoCode);

// Apply coins
router.post("/:bookingId/apply-coins", bookingController.applyCoins);

// Schedule booking
router.post(
  "/schedule",
  rateLimiters.booking,
  bookingController.scheduleBooking,
);

// Get scheduled bookings
router.get("/scheduled/list", bookingController.getScheduledBookings);

// Cancel scheduled booking
router.delete(
  "/scheduled/:bookingId",
  bookingController.cancelScheduledBooking,
);

// Cancel booking
router.post("/:bookingId/cancel", bookingController.cancelBooking);

// Rate booking/driver
router.post("/:bookingId/rate", bookingController.rateBooking);

// Get booking invoice
router.get("/:bookingId/invoice", bookingController.getBookingInvoice);

// Get available vehicle types for a route
router.post(
  "/vehicle-options",
  rateLimiters.search,
  bookingController.getVehicleOptions,
);

// Get addon services
router.get("/addons/list", bookingController.getAddonServices);

// Get goods types
router.get("/goods-types", bookingController.getGoodsTypes);

// Get cancellation reasons
router.get("/cancellation-reasons", bookingController.getCancellationReasons);

// Get time slots for scheduling
router.get("/time-slots", bookingController.getTimeSlots);

export default router;
