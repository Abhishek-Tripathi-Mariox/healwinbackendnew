import { Router } from "express";
import * as NotificationController from "../controllers/notification.controller";
import * as DeviceTokenController from "../controllers/device-token.controller";
import AuthMiddleware from "../middlewares/auth.middleware";
import { optionalUserAuth } from "../middlewares/optional-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";

const router = Router();
const { verifyUserToken } = AuthMiddleware();

// ========== Public (works for not-logged-in installs) ==========
router.post(
  "/devices/register",
  optionalUserAuth,
  ErrorHandlerMiddleware(DeviceTokenController.registerDevice),
);
router.post(
  "/devices/unregister",
  optionalUserAuth,
  ErrorHandlerMiddleware(DeviceTokenController.unregisterDevice),
);

/**
 * @route GET /v1/api/notifications
 * @desc Get user notifications
 * @access Private
 */
router.get(
  "/",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.getNotifications),
);

/**
 * @route GET /v1/api/notifications/unread-count
 * @desc Get unread notification count
 * @access Private
 */
router.get(
  "/unread-count",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.getUnreadCount),
);

/**
 * @route PUT /v1/api/notifications/:notificationId/read
 * @desc Mark notification as read
 * @access Private
 */
router.put(
  "/:notificationId/read",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.markAsRead),
);

/**
 * @route PUT /v1/api/notifications/read-all
 * @desc Mark all notifications as read
 * @access Private
 */
router.put(
  "/read-all",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.markAllAsRead),
);

/**
 * @route PUT /v1/api/notifications/fcm-token
 * @desc Update FCM token
 * @access Private
 */
router.put(
  "/fcm-token",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.updateFcmToken),
);
// POST alias kept so older app builds keep working.
router.post(
  "/fcm-token",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.updateFcmToken),
);

/**
 * @route GET /v1/api/notifications/settings
 * @desc Get notification settings
 * @access Private
 */
router.get(
  "/settings",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.getNotificationSettings),
);

/**
 * @route PUT /v1/api/notifications/settings
 * @desc Update notification settings
 * @access Private
 */
router.put(
  "/settings",
  verifyUserToken,
  ErrorHandlerMiddleware(NotificationController.toggleNotifications),
);

export default router;
