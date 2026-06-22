import { Types } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";
import { Notification, PushTemplate } from "../models/notification.model";
import User from "../models/Users";
import Driver from "../models/driver.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import { DeviceToken } from "../models/device-token.model";
import { cache } from "../utils/redis.util";
import { emitToUser } from "../utils/socket.util";

/** Shape a saved notification for the realtime `notification:new` payload. */
const notificationPayload = (n: any) => ({
  _id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  data: n.data || {},
  isRead: false,
  createdAt: n.createdAt,
});

let firebaseApp: admin.app.App | null = null;

/**
 * Initialize Firebase Admin SDK.
 *
 * Loads credentials in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT — full JSON string (Heroku/k8s secret style)
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH — absolute or repo-relative path
 *   3. ./firebase-service-account.json next to backend root (dev convenience)
 *
 * Without credentials we log and continue — push attempts will no-op so
 * unrelated features (REST, sockets) still work in local dev.
 */
export const initializeFirebase = async () => {
  if (firebaseApp) return true;
  try {
    let credentialJson: admin.ServiceAccount | null = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      credentialJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      const candidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.resolve(process.cwd(), "firebase-service-account.json"),
      ].filter(Boolean) as string[];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          credentialJson = JSON.parse(fs.readFileSync(p, "utf8"));
          break;
        }
      }
    }

    if (!credentialJson) {
      console.warn(
        "[FCM] No Firebase service account found — push notifications disabled.",
      );
      return false;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(credentialJson),
    });
    console.log("[FCM] Firebase Admin initialized");
    return true;
  } catch (error) {
    console.error("[FCM] Failed to initialize Firebase:", error);
    return false;
  }
};

/**
 * Send push notification to a single device
 */
export const sendPushNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> => {
  if (!firebaseApp) {
    console.log("[FCM] Skipped (not initialized):", { title, body });
    return false;
  }
  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: { title, body },
      data: stringifyValues(data),
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "healwin_channel",
          // No `icon` override — see sendMulticastNotification for the
          // full explanation; same suppression bug applies here.
          color: "#002A5D",
        },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
    };
    await firebaseApp.messaging().send(message);
    return true;
  } catch (error: any) {
    console.error("[FCM] send failed:", error?.code || error?.message);
    if (
      error?.code === "messaging/invalid-registration-token" ||
      error?.code === "messaging/registration-token-not-registered"
    ) {
      await removeInvalidToken(fcmToken);
    }
    return false;
  }
};

/**
 * Send a dispatch push — same as sendPushNotification but routed to the
 * dedicated `healwin_dispatch_channel`. That channel is registered on the
 * driver app with Importance.max + a phone-call style vibration pattern,
 * so the OS surfaces a loud heads-up that wakes the screen on lock and
 * survives Do-Not-Disturb (when the user allows it). Regular pushes stay
 * on `healwin_channel` so admin broadcasts don't ring like an emergency.
 *
 * `apns.interruption-level: time-sensitive` gives iOS the equivalent —
 * pierces Focus modes when the user opts in.
 */
export const sendDispatchPush = async (
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> => {
  if (!firebaseApp) {
    console.log("[FCM] Dispatch push skipped (not initialized):", {
      title,
      body,
    });
    return false;
  }
  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: { title, body },
      data: stringifyValues(data),
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "healwin_dispatch_channel",
          color: "#D32F2F",
          priority: "max",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: {
            sound: "default",
            "interruption-level": "time-sensitive",
          },
        },
      },
    };
    await firebaseApp.messaging().send(message);
    return true;
  } catch (error: any) {
    console.error(
      "[FCM] Dispatch send failed:",
      error?.code || error?.message,
    );
    if (
      error?.code === "messaging/invalid-registration-token" ||
      error?.code === "messaging/registration-token-not-registered"
    ) {
      await removeInvalidToken(fcmToken);
    }
    return false;
  }
};

/** FCM `data` payloads must be string-only. */
const stringifyValues = (
  data?: Record<string, any>,
): Record<string, string> | undefined => {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
};

/**
 * Send push notification to multiple devices
 */
export const sendMulticastNotification = async (
  fcmTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ successCount: number; failureCount: number }> => {
  if (fcmTokens.length === 0) return { successCount: 0, failureCount: 0 };
  if (!firebaseApp) {
    console.log("[FCM] Multicast skipped (not initialized):", {
      tokens: fcmTokens.length,
      title,
    });
    return { successCount: 0, failureCount: fcmTokens.length };
  }
  try {
    const payload: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: { title, body },
      data: stringifyValues(data),
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "healwin_channel",
          // Intentionally NOT setting `icon` — referencing a drawable name
          // that doesn't exist in the client app's res/drawable causes
          // Android 7+ to silently suppress the entire notification while
          // FCM still reports it as "delivered". Fall back to the app's
          // launcher icon, which every install ships with.
          color: "#002A5D",
        },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
    };
    const response = await firebaseApp.messaging().sendEachForMulticast(payload);
    // Per-token diagnostic. If the admin says "delivered" but the driver
    // doesn't see anything, the messageId here proves FCM accepted it and
    // points the investigation at the device (battery saver, killed app,
    // notification channel disabled). Errors are also logged with the
    // FCM code so invalid/expired tokens are obvious.
    response.responses.forEach((r, i) => {
      const tail = fcmTokens[i].slice(-8);
      if (r.success) {
        console.log(`[FCM] OK   tail=${tail} messageId=${r.messageId}`);
      } else {
        console.warn(
          `[FCM] FAIL tail=${tail} code=${r.error?.code} msg=${r.error?.message}`,
        );
      }
    });
    if (response.failureCount > 0) {
      // Only delete tokens that are genuinely dead. Config/transient errors
      // (e.g. mismatched-credential, server-unavailable) must NOT remove a
      // perfectly valid token — that wrongly wipes the device and the user
      // then gets no notifications until they reopen the app.
      const DEAD_TOKEN_CODES = new Set([
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
        "messaging/invalid-argument",
      ]);
      const failed: string[] = [];
      response.responses.forEach((r, i) => {
        if (!r.success && r.error?.code && DEAD_TOKEN_CODES.has(r.error.code)) {
          failed.push(fcmTokens[i]);
        }
      });
      if (failed.length) await Promise.all(failed.map((t) => removeInvalidToken(t)));
    }
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("[FCM] multicast failed:", error);
    return { successCount: 0, failureCount: fcmTokens.length };
  }
};

/**
 * Remove invalid FCM token from database
 */
const removeInvalidToken = async (fcmToken: string) => {
  try {
    await Promise.all([
      User.updateMany({ fcmToken }, { $unset: { fcmToken: 1 } }),
      Driver.updateMany({ fcmToken }, { $unset: { fcmToken: 1 } }),
      DeviceToken.deleteOne({ fcmToken }),
    ]);
  } catch (error) {
    console.error("Failed to remove invalid token:", error);
  }
};

/**
 * Send notification to user
 */
export const sendToUser = async (
  userId: Types.ObjectId,
  type: "BOOKING" | "PAYMENT" | "PROMO" | "SYSTEM" | "CHAT" | "REWARD",
  title: string,
  body: string,
  data?: Record<string, string>,
  referenceId?: Types.ObjectId,
  referenceType?: string,
): Promise<boolean> => {
  try {
    // Save notification to database
    const notification = new Notification({
      userId,
      type,
      title,
      body,
      data,
      referenceId,
      referenceType,
      isRead: false,
    });
    await notification.save();

    // Real-time: push the new notification to the user's app instantly (live
    // list + badge) instead of waiting for the next manual refresh.
    emitToUser(String(userId), "notification:new", notificationPayload(notification));

    // Push to EVERY active device the user registered, not just the single
    // `User.fcmToken` field (which can be empty if the device registered before
    // login). DeviceToken rows are linked to the user on authenticated
    // register, so this is the reliable source; we also include the legacy
    // User.fcmToken and de-dupe.
    const user = await User.findById(userId).select("fcmToken isNotificationEnabled");
    if (user?.isNotificationEnabled === false) return true;

    const deviceTokens = await DeviceToken.find({ userId, isActive: true })
      .select("fcmToken")
      .lean();
    const tokens = Array.from(
      new Set(
        [
          ...deviceTokens.map((d: any) => d.fcmToken),
          user?.fcmToken,
        ].filter(Boolean) as string[],
      ),
    );

    if (tokens.length > 0) {
      await sendMulticastNotification(tokens, title, body, {
        ...data,
        notificationId: notification._id.toString(),
        type,
      });
    } else {
      console.log("[FCM] No device tokens for user", String(userId));
    }

    return true;
  } catch (error) {
    console.error("Failed to send notification to user:", error);
    return false;
  }
};

/**
 * Send notification to driver
 */
export const sendToDriver = async (
  driverId: Types.ObjectId,
  type: "BOOKING" | "PAYMENT" | "PROMO" | "SYSTEM" | "CHAT" | "REWARD",
  title: string,
  body: string,
  data?: Record<string, string>,
  referenceId?: Types.ObjectId,
  referenceType?: string,
): Promise<boolean> => {
  try {
    // Save notification to database
    const notification = new Notification({
      driverId,
      type,
      title,
      body,
      data,
      referenceId,
      referenceType,
      isRead: false,
    });
    await notification.save();

    // Real-time: push to the driver app instantly (live list + badge).
    emitToUser(String(driverId), "notification:new", notificationPayload(notification));

    // Get driver's FCM token
    const driver = await Driver.findById(driverId).select(
      "fcmToken isNotificationEnabled",
    );

    if (driver?.fcmToken && driver.isNotificationEnabled !== false) {
      await sendPushNotification(driver.fcmToken, title, body, {
        ...data,
        notificationId: notification._id.toString(),
        type,
      });
    }

    return true;
  } catch (error) {
    console.error("Failed to send notification to driver:", error);
    return false;
  }
};

/**
 * Send notification to an ambulance-staff member (driver/attendant).
 *
 * Mirrors sendToDriver but targets the AmbulanceStaff inbox + push token.
 * Persists a Notification row (so it shows in the staff app's bell), pushes
 * it live over the socket room keyed by staffId, and fires an FCM push to the
 * single fcmToken the staff device registered at login.
 */
export const sendToStaff = async (
  staffId: Types.ObjectId | string,
  type: "BOOKING" | "PAYMENT" | "PROMO" | "SYSTEM" | "CHAT" | "REWARD",
  title: string,
  body: string,
  data?: Record<string, string>,
  referenceId?: Types.ObjectId,
  referenceType?: string,
): Promise<boolean> => {
  try {
    const notification = new Notification({
      staffId,
      type,
      title,
      body,
      data,
      referenceId,
      referenceType,
      isRead: false,
    });
    await notification.save();

    // Real-time: push to the staff app instantly (live list + badge).
    emitToUser(String(staffId), "notification:new", notificationPayload(notification));

    const staff = await AmbulanceStaff.findById(staffId).select("fcmToken");
    if (staff?.fcmToken) {
      await sendPushNotification(staff.fcmToken, title, body, {
        ...data,
        notificationId: notification._id.toString(),
        type,
      });
    }

    return true;
  } catch (error) {
    console.error("Failed to send notification to staff:", error);
    return false;
  }
};

/**
 * Send notification using template
 */
export const sendUsingTemplate = async (
  templateKey: string,
  recipientId: Types.ObjectId,
  recipientType: "USER" | "DRIVER",
  variables: Record<string, string>,
  referenceId?: Types.ObjectId,
  referenceType?: string,
): Promise<boolean> => {
  try {
    // Get template from cache or database
    let template = await cache.get<any>(`push_template:${templateKey}`);

    if (!template) {
      template = await PushTemplate.findOne({
        key: templateKey,
        isActive: true,
      });
      if (template) {
        await cache.set(`push_template:${templateKey}`, template, 3600);
      }
    }

    if (!template) {
      console.error(`Push template not found: ${templateKey}`);
      return false;
    }

    // Replace variables in template
    let title = template.title;
    let body = template.body;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      title = title.replace(regex, value);
      body = body.replace(regex, value);
    });

    // Send notification
    if (recipientType === "USER") {
      return await sendToUser(
        recipientId,
        template.type,
        title,
        body,
        variables,
        referenceId,
        referenceType,
      );
    } else {
      return await sendToDriver(
        recipientId,
        template.type,
        title,
        body,
        variables,
        referenceId,
        referenceType,
      );
    }
  } catch (error) {
    console.error("Failed to send notification using template:", error);
    return false;
  }
};

/**
 * Get user notifications
 */
export const getUserNotifications = async (
  userId: Types.ObjectId,
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount,
  };
};

/**
 * Get driver notifications
 */
export const getDriverNotifications = async (
  driverId: Types.ObjectId,
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ driverId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ driverId }),
    Notification.countDocuments({ driverId, isRead: false }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount,
  };
};

/**
 * Mark notification as read
 */
export const markAsRead = async (
  notificationId: Types.ObjectId,
  userId?: Types.ObjectId,
  driverId?: Types.ObjectId,
) => {
  const query: any = { _id: notificationId };
  if (userId) query.userId = userId;
  if (driverId) query.driverId = driverId;

  await Notification.updateOne(query, { isRead: true });
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (
  userId?: Types.ObjectId,
  driverId?: Types.ObjectId,
) => {
  const query: any = { isRead: false };
  if (userId) query.userId = userId;
  if (driverId) query.driverId = driverId;

  await Notification.updateMany(query, { isRead: true });
};

/**
 * Delete old notifications (cleanup job)
 */
export const deleteOldNotifications = async (daysOld: number = 30) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await Notification.deleteMany({
    createdAt: { $lt: cutoffDate },
    isRead: true,
  });

  return result.deletedCount;
};

/**
 * Send booking status notification
 */
export const sendBookingStatusNotification = async (
  userId: Types.ObjectId,
  bookingId: Types.ObjectId,
  status: string,
  driverName?: string,
) => {
  const statusMessages: Record<string, { title: string; body: string }> = {
    ASSIGNED: {
      title: "Driver Assigned",
      body: `${driverName || "A driver"} has been assigned to your booking.`,
    },
    DRIVER_ARRIVED: {
      title: "Driver Arrived",
      body: "Your driver has arrived at the pickup location.",
    },
    PICKED_UP: {
      title: "Goods Picked Up",
      body: "Your goods have been picked up and are on the way.",
    },
    COMPLETED: {
      title: "Delivery Completed",
      body: "Your delivery has been completed successfully!",
    },
    CANCELLED: {
      title: "Booking Cancelled",
      body: "Your booking has been cancelled.",
    },
  };

  const message = statusMessages[status];
  if (!message) return false;

  return await sendToUser(
    userId,
    "BOOKING",
    message.title,
    message.body,
    { bookingId: bookingId.toString(), status },
    bookingId,
    "Booking",
  );
};

/**
 * Send promotional notification to all users
 */
export const sendPromoNotification = async (
  title: string,
  body: string,
  promoCode?: string,
  targetAudience?: "ALL" | "ACTIVE" | "INACTIVE",
) => {
  const query: any = { isActive: true, isNotificationEnabled: true };

  if (targetAudience === "ACTIVE") {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query.lastActiveAt = { $gte: thirtyDaysAgo };
  } else if (targetAudience === "INACTIVE") {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query.lastActiveAt = { $lt: thirtyDaysAgo };
  }

  const users = await User.find(query).select("_id fcmToken");

  const fcmTokens = users
    .filter((u) => u.fcmToken)
    .map((u) => u.fcmToken as string);

  // Save notifications for all users
  const notifications = users.map((user) => ({
    userId: user._id,
    type: "PROMO",
    title,
    body,
    data: promoCode ? { promoCode } : undefined,
    isRead: false,
  }));

  await Notification.insertMany(notifications);

  // Send push notifications in batches of 500
  const batchSize = 500;
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let i = 0; i < fcmTokens.length; i += batchSize) {
    const batch = fcmTokens.slice(i, i + batchSize);
    const result = await sendMulticastNotification(batch, title, body, {
      promoCode: promoCode || "",
    });
    totalSuccess += result.successCount;
    totalFailure += result.failureCount;
  }

  return {
    totalUsers: users.length,
    successCount: totalSuccess,
    failureCount: totalFailure,
  };
};
