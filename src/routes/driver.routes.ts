import { Router } from "express";
import DriverAuthMiddleware from "../middlewares/driver-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import * as DriverController from "../controllers/driver.controller";
import { makeSupportHandlers } from "../controllers/app-support.controller";
import upload from "../middlewares/upload.middleware";

const driverRouter = Router();
const DriverSupport = makeSupportHandlers("DRIVER");

// Apply driver auth middleware to all routes
driverRouter.use(DriverAuthMiddleware().verifyDriverToken);

// =====================
// PROFILE
// =====================

// Get driver profile
driverRouter.get(
  "/profile",
  ErrorHandlerMiddleware(DriverController.getProfile),
  ResponseMiddleware,
);

// Update driver profile
driverRouter.put(
  "/profile",
  ErrorHandlerMiddleware(DriverController.updateProfile),
  ResponseMiddleware,
);

// Update profile photo
driverRouter.put(
  "/profile/photo",
  upload.single("photo"),
  ErrorHandlerMiddleware(DriverController.updateProfilePhoto),
  ResponseMiddleware,
);

// =====================
// BANK DETAILS
// =====================

// Get bank details
driverRouter.get(
  "/bank-details",
  ErrorHandlerMiddleware(DriverController.getBankDetails),
  ResponseMiddleware,
);

// Add/Update bank details
driverRouter.put(
  "/bank-details",
  ErrorHandlerMiddleware(DriverController.updateBankDetails),
  ResponseMiddleware,
);

// =====================
// ADDRESS
// =====================

// Get addresses
driverRouter.get(
  "/addresses",
  ErrorHandlerMiddleware(DriverController.getAddresses),
  ResponseMiddleware,
);

// Add address
driverRouter.post(
  "/addresses",
  ErrorHandlerMiddleware(DriverController.addAddress),
  ResponseMiddleware,
);

// Update address
driverRouter.put(
  "/addresses/:addressId",
  ErrorHandlerMiddleware(DriverController.updateAddress),
  ResponseMiddleware,
);

// Delete address
driverRouter.delete(
  "/addresses/:addressId",
  ErrorHandlerMiddleware(DriverController.deleteAddress),
  ResponseMiddleware,
);

// =====================
// EARNINGS & WALLET
// =====================

// Get earnings summary
driverRouter.get(
  "/earnings",
  ErrorHandlerMiddleware(DriverController.getEarnings),
  ResponseMiddleware,
);

// Get earnings history
driverRouter.get(
  "/earnings/history",
  ErrorHandlerMiddleware(DriverController.getEarningsHistory),
  ResponseMiddleware,
);

// Get wallet balance
driverRouter.get(
  "/wallet",
  ErrorHandlerMiddleware(DriverController.getWallet),
  ResponseMiddleware,
);

// Get wallet transactions
driverRouter.get(
  "/wallet/transactions",
  ErrorHandlerMiddleware(DriverController.getWalletTransactions),
  ResponseMiddleware,
);

// Recharge wallet
driverRouter.post(
  "/wallet/recharge",
  ErrorHandlerMiddleware(DriverController.rechargeWallet),
  ResponseMiddleware,
);

// Withdraw from wallet
driverRouter.post(
  "/wallet/withdraw",
  ErrorHandlerMiddleware(DriverController.withdrawFromWallet),
  ResponseMiddleware,
);

// =====================
// BOOKINGS (DRIVER SIDE)
// =====================

// Get recommended bookings (available for driver)
driverRouter.get(
  "/bookings/recommended",
  ErrorHandlerMiddleware(DriverController.getRecommendedBookings),
  ResponseMiddleware,
);

// Get driver's booking history
driverRouter.get(
  "/bookings/history",
  ErrorHandlerMiddleware(DriverController.getBookingHistory),
  ResponseMiddleware,
);

// Get current/active booking
driverRouter.get(
  "/bookings/current",
  ErrorHandlerMiddleware(DriverController.getCurrentBooking),
  ResponseMiddleware,
);

// Accept booking
driverRouter.post(
  "/bookings/:bookingId/accept",
  ErrorHandlerMiddleware(DriverController.acceptBooking),
  ResponseMiddleware,
);

// Reject/Skip booking
driverRouter.post(
  "/bookings/:bookingId/reject",
  ErrorHandlerMiddleware(DriverController.rejectBooking),
  ResponseMiddleware,
);

// Arrived at pickup
driverRouter.post(
  "/bookings/:bookingId/arrived",
  ErrorHandlerMiddleware(DriverController.arrivedAtPickup),
  ResponseMiddleware,
);

// Verify pickup OTP and start trip
driverRouter.post(
  "/bookings/:bookingId/verify-otp",
  ErrorHandlerMiddleware(DriverController.verifyPickupOtp),
  ResponseMiddleware,
);

// Start trip (after OTP verification)
driverRouter.post(
  "/bookings/:bookingId/start",
  ErrorHandlerMiddleware(DriverController.startTrip),
  ResponseMiddleware,
);

// Complete trip
driverRouter.post(
  "/bookings/:bookingId/complete",
  ErrorHandlerMiddleware(DriverController.completeTrip),
  ResponseMiddleware,
);

// Collect cash payment
driverRouter.post(
  "/bookings/:bookingId/collect-cash",
  ErrorHandlerMiddleware(DriverController.collectCashPayment),
  ResponseMiddleware,
);

// Get booking details
driverRouter.get(
  "/bookings/:bookingId",
  ErrorHandlerMiddleware(DriverController.getBookingDetails),
  ResponseMiddleware,
);

// =====================
// ONLINE STATUS
// =====================

// Toggle online/offline status
driverRouter.post(
  "/status/toggle",
  ErrorHandlerMiddleware(DriverController.toggleOnlineStatus),
  ResponseMiddleware,
);

// Update location
driverRouter.post(
  "/location",
  ErrorHandlerMiddleware(DriverController.updateLocation),
  ResponseMiddleware,
);

// =====================
// VEHICLES
// =====================

// Get driver's vehicles
driverRouter.get(
  "/vehicles",
  ErrorHandlerMiddleware(DriverController.getVehicles),
  ResponseMiddleware,
);

// Add another vehicle
driverRouter.post(
  "/vehicles",
  upload.any(),
  ErrorHandlerMiddleware(DriverController.addVehicle),
  ResponseMiddleware,
);

// Update vehicle
driverRouter.put(
  "/vehicles/:vehicleId",
  ErrorHandlerMiddleware(DriverController.updateVehicle),
  ResponseMiddleware,
);

// Delete vehicle
driverRouter.delete(
  "/vehicles/:vehicleId",
  ErrorHandlerMiddleware(DriverController.deleteVehicle),
  ResponseMiddleware,
);

// Set active vehicle
driverRouter.post(
  "/vehicles/:vehicleId/set-active",
  ErrorHandlerMiddleware(DriverController.setActiveVehicle),
  ResponseMiddleware,
);

// =====================
// TRAINING & LEARNING
// =====================

// Get training modules
driverRouter.get(
  "/training",
  ErrorHandlerMiddleware(DriverController.getTrainingModules),
  ResponseMiddleware,
);

// Get training module details
driverRouter.get(
  "/training/:moduleId",
  ErrorHandlerMiddleware(DriverController.getTrainingModuleDetails),
  ResponseMiddleware,
);

// Complete training lesson
driverRouter.post(
  "/training/:moduleId/lessons/:lessonId/complete",
  ErrorHandlerMiddleware(DriverController.completeTrainingLesson),
  ResponseMiddleware,
);

// Get training progress
driverRouter.get(
  "/training/progress",
  ErrorHandlerMiddleware(DriverController.getTrainingProgress),
  ResponseMiddleware,
);

// =====================
// BADGES & ACHIEVEMENTS
// =====================

// Get all badges
driverRouter.get(
  "/badges",
  ErrorHandlerMiddleware(DriverController.getBadges),
  ResponseMiddleware,
);

// Get unlocked badges
driverRouter.get(
  "/badges/unlocked",
  ErrorHandlerMiddleware(DriverController.getUnlockedBadges),
  ResponseMiddleware,
);

// Get badge requirements
driverRouter.get(
  "/badges/:badgeId/requirements",
  ErrorHandlerMiddleware(DriverController.getBadgeRequirements),
  ResponseMiddleware,
);

// =====================
// INCENTIVES
// =====================

// Get incentive history
driverRouter.get(
  "/incentives",
  ErrorHandlerMiddleware(DriverController.getIncentives),
  ResponseMiddleware,
);

// Get active incentive offers
driverRouter.get(
  "/incentives/active",
  ErrorHandlerMiddleware(DriverController.getActiveIncentives),
  ResponseMiddleware,
);

// =====================
// REFERRAL
// =====================

// Get referral code
driverRouter.get(
  "/referral",
  ErrorHandlerMiddleware(DriverController.getReferralCode),
  ResponseMiddleware,
);

// Apply referral code
driverRouter.post(
  "/referral/apply",
  ErrorHandlerMiddleware(DriverController.applyReferralCode),
  ResponseMiddleware,
);

// Get referral history
driverRouter.get(
  "/referral/history",
  ErrorHandlerMiddleware(DriverController.getReferralHistory),
  ResponseMiddleware,
);

// =====================
// ONBOARDING PAYMENT
// =====================

// Get onboarding fee details
driverRouter.get(
  "/onboarding-fee",
  ErrorHandlerMiddleware(DriverController.getOnboardingFee),
  ResponseMiddleware,
);

// Initiate onboarding fee payment
driverRouter.post(
  "/onboarding-fee/pay",
  ErrorHandlerMiddleware(DriverController.payOnboardingFee),
  ResponseMiddleware,
);

// Verify onboarding fee payment
driverRouter.post(
  "/onboarding-fee/verify",
  ErrorHandlerMiddleware(DriverController.verifyOnboardingPayment),
  ResponseMiddleware,
);

// =====================
// SUPPORT
// =====================

// Raise support ticket
driverRouter.post(
  "/support/ticket",
  ErrorHandlerMiddleware(DriverController.raiseTicket),
  ResponseMiddleware,
);

// Get support tickets
driverRouter.get(
  "/support/tickets",
  ErrorHandlerMiddleware(DriverController.getTickets),
  ResponseMiddleware,
);

// Get ticket details
driverRouter.get(
  "/support/tickets/:ticketId",
  ErrorHandlerMiddleware(DriverController.getTicketDetails),
  ResponseMiddleware,
);

// Reply to ticket
driverRouter.post(
  "/support/tickets/:ticketId/reply",
  ErrorHandlerMiddleware(DriverController.replyToTicket),
  ResponseMiddleware,
);

// =====================
// DRIVER INSTRUCTIONS
// =====================

// Get driver instructions
driverRouter.get(
  "/instructions",
  ErrorHandlerMiddleware(DriverController.getInstructions),
  ResponseMiddleware,
);

// Acknowledge instructions
driverRouter.post(
  "/instructions/acknowledge",
  ErrorHandlerMiddleware(DriverController.acknowledgeInstructions),
  ResponseMiddleware,
);

// =====================
// DAILY CHECKLIST
// =====================

// Get daily checklist
driverRouter.get(
  "/checklist",
  ErrorHandlerMiddleware(DriverController.getDailyChecklist),
  ResponseMiddleware,
);

// Submit daily checklist
driverRouter.post(
  "/checklist",
  upload.any(),
  ErrorHandlerMiddleware(DriverController.submitDailyChecklist),
  ResponseMiddleware,
);

// =====================
// NOTIFICATIONS
// =====================

// Get notifications
driverRouter.get(
  "/notifications",
  ErrorHandlerMiddleware(DriverController.getNotifications),
  ResponseMiddleware,
);

// Mark notification as read
driverRouter.post(
  "/notifications/:notificationId/read",
  ErrorHandlerMiddleware(DriverController.markNotificationRead),
  ResponseMiddleware,
);

// Update FCM token
driverRouter.post(
  "/notifications/fcm-token",
  ErrorHandlerMiddleware(DriverController.updateFcmToken),
  ResponseMiddleware,
);

// =====================
// SUPPORT TICKETS
// =====================
driverRouter.get("/tickets", ErrorHandlerMiddleware(DriverSupport.getMyTickets), ResponseMiddleware);
driverRouter.post("/tickets", ErrorHandlerMiddleware(DriverSupport.createTicket), ResponseMiddleware);
driverRouter.get("/tickets/:ticketId", ErrorHandlerMiddleware(DriverSupport.getTicket), ResponseMiddleware);
driverRouter.post("/tickets/:ticketId/messages", ErrorHandlerMiddleware(DriverSupport.addMessage), ResponseMiddleware);
driverRouter.post("/tickets/:ticketId/close", ErrorHandlerMiddleware(DriverSupport.closeTicket), ResponseMiddleware);

export default driverRouter;
