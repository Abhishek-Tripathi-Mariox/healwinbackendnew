import { Request, Response } from "express";
import { Types } from "mongoose";
import * as NotificationService from "../../services/notification.service";
import { DeviceToken } from "../../models/device-token.model";
import { Notification } from "../../models/notification.model";
import User from "../../models/Users";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { emitToUser } from "../../utils/socket.util";

type Audience = "ALL" | "ANONYMOUS" | "PATIENTS" | "DRIVERS";

const TYPE_VALUES = [
  "BOOKING",
  "PAYMENT",
  "PROMO",
  "SYSTEM",
  "CHAT",
  "REWARD",
] as const;

type NotifType = (typeof TYPE_VALUES)[number];

const sanitizeType = (raw: any): NotifType =>
  TYPE_VALUES.includes(raw) ? (raw as NotifType) : "SYSTEM";

/**
 * Broadcast to a segment of installed apps. Targets DeviceToken collection
 * so anonymous (not-logged-in) installs are reachable too.
 *
 * body: { title, body, audience?, route?, data?, type? }
 */
export const broadcastNotification = async (req: Request, res: Response) => {
  try {
    const {
      title,
      body,
      audience = "ALL",
      route,
      data,
      type,
    } = req.body || {};

    if (!title || !body) {
      return res
        .status(400)
        .json({ success: false, message: "title and body are required" });
    }

    const notifType = sanitizeType(type);
    const filter: any = { isActive: true };
    switch (audience as Audience) {
      case "ANONYMOUS":
        filter.role = "anonymous";
        break;
      case "PATIENTS":
        filter.role = "patient";
        break;
      case "DRIVERS":
        filter.role = "driver";
        break;
      // ALL → no extra filter
    }

    const tokens = await DeviceToken.find(filter)
      .select("fcmToken userId driverId")
      .lean();

    // Ambulance staff register their FCM token directly on the staff row
    // (see /ambulance-staff/fcm-token), not in the DeviceToken collection,
    // so we union them in here for DRIVERS and ALL audiences.
    //
    // The admin's "DRIVERS" audience targets *the driver app*, which both
    // ambulance drivers AND attendants share — the sidebar even labels
    // AmbulanceStaff as "Drivers" generically. Restricting to
    // role === "driver" here would silently drop every attendant from
    // operational broadcasts; that's exactly the bug that surfaced as
    // "Sent to 0 devices" when an attendant was the only signed-in
    // tester. The audience now spans every active staff member with a
    // registered FCM token.
    let staffTokens: string[] = [];
    let staffRecipients: { staffId: Types.ObjectId; fcmToken: string }[] = [];
    if (audience === "DRIVERS" || audience === "ALL") {
      const staffFilter: any = {
        isActive: true,
        isDeleted: false,
        fcmToken: { $ne: null },
      };
      const staff = await AmbulanceStaff.find(staffFilter)
        .select("_id fcmToken role")
        .lean();
      staffRecipients = staff
        .filter((s: any) => !!s.fcmToken)
        .map((s: any) => ({ staffId: s._id, fcmToken: s.fcmToken as string }));
      staffTokens = staffRecipients.map((s) => s.fcmToken);
    }

    if (tokens.length === 0 && staffTokens.length === 0) {
      // Audit: which audience filter starved out the recipients? Common
      // cause is "DRIVERS" with empty AmbulanceStaff.fcmToken across the
      // board, i.e. no device has uploaded its token yet.
      const staffWithoutToken = await AmbulanceStaff.countDocuments({
        isActive: true,
        isDeleted: false,
        $or: [{ fcmToken: null }, { fcmToken: { $exists: false } }],
      });
      console.log(
        `[FCM] broadcast audience=${audience} → 0 recipients. ` +
          `device_tokens=0 staff_tokens=0 staff_missing_token=${staffWithoutToken}`,
      );
      return res.json({
        success: true,
        data: {
          totalDevices: 0,
          successCount: 0,
          failureCount: 0,
          hint:
            audience === "DRIVERS" || audience === "ALL"
              ? `No ambulance staff (driver or attendant) has uploaded an FCM token. ${staffWithoutToken} active staff record(s) have empty fcmToken — they need to sign in on the driver app and grant notification permission.`
              : "No registered devices match this audience yet.",
        },
      });
    }
    console.log(
      `[FCM] broadcast audience=${audience} device_tokens=${tokens.length} staff_tokens=${staffTokens.length}`,
    );

    // Persist a notification row for every logged-in recipient so it shows
    // up in the in-app inbox alongside the push.
    const userRecipients = tokens
      .filter((t) => t.userId)
      .map((t) => ({
        userId: t.userId,
        type: notifType,
        title,
        body,
        data: { ...(data || {}), route },
        isRead: false,
      }));
    if (userRecipients.length > 0) {
      await Notification.insertMany(userRecipients, { ordered: false }).catch(
        () => undefined,
      );
    }
    // Dedupe by staffId in case the same staff member shows up twice from
    // an aggregation oddity, then persist one inbox row per staff member.
    if (staffRecipients.length > 0) {
      const seen = new Set<string>();
      const inboxRows = staffRecipients
        .filter((s) => {
          const key = s.staffId.toString();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((s) => ({
          staffId: s.staffId,
          type: notifType,
          title,
          body,
          data: { ...(data || {}), route },
          isRead: false,
        }));
      if (inboxRows.length > 0) {
        await Notification.insertMany(inboxRows, { ordered: false }).catch(
          () => undefined,
        );
      }
    }

    const fcmPayload: Record<string, string> = { source: "admin" };
    if (route) fcmPayload.route = String(route);
    if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined) fcmPayload[k] = String(v);
      }
    }

    let success = 0;
    let failure = 0;
    const batch = 500;
    const fcmTokens = Array.from(
      new Set([...tokens.map((t) => t.fcmToken), ...staffTokens]),
    );
    for (let i = 0; i < fcmTokens.length; i += batch) {
      const slice = fcmTokens.slice(i, i + batch);
      const r = await NotificationService.sendMulticastNotification(
        slice,
        title,
        body,
        fcmPayload,
      );
      success += r.successCount;
      failure += r.failureCount;
    }

    res.json({
      success: true,
      data: {
        totalDevices: fcmTokens.length,
        successCount: success,
        failureCount: failure,
      },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "broadcast failed" });
  }
};

/**
 * Send to one specific user (looked up by ID). Persists to inbox + pushes
 * to every device the user has registered.
 */
export const sendToUser = async (req: Request, res: Response) => {
  try {
    const { userId, title, body, route, data, type } = req.body || {};
    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: "userId, title and body are required",
      });
    }

    const notifType = sanitizeType(type);
    const oid = new Types.ObjectId(String(userId));

    const tokens = await DeviceToken.find({ userId: oid, isActive: true })
      .select("fcmToken")
      .lean();

    const notification = await Notification.create({
      userId: oid,
      type: notifType,
      title,
      body,
      data: { ...(data || {}), route },
      isRead: false,
    });

    // Real-time: surface the admin message in the user's app immediately.
    emitToUser(String(oid), "notification:new", {
      _id: String(notification._id),
      type: notifType,
      title,
      body,
      data: { ...(data || {}), route },
      isRead: false,
      createdAt: (notification as any).createdAt,
    });

    let success = 0;
    let failure = 0;
    if (tokens.length > 0) {
      const fcmPayload: Record<string, string> = {
        source: "admin",
        notificationId: notification._id.toString(),
        type: notifType,
      };
      if (route) fcmPayload.route = String(route);
      if (data && typeof data === "object") {
        for (const [k, v] of Object.entries(data)) {
          if (v !== null && v !== undefined) fcmPayload[k] = String(v);
        }
      }
      const r = await NotificationService.sendMulticastNotification(
        tokens.map((t) => t.fcmToken),
        title,
        body,
        fcmPayload,
      );
      success = r.successCount;
      failure = r.failureCount;
    }

    res.json({
      success: true,
      data: { devices: tokens.length, successCount: success, failureCount: failure },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "send failed" });
  }
};

/** List recent admin-sent (or any) notifications for an audit/history view. */
export const listNotifications = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (req.query.type) filter.type = req.query.type;

    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "fullName email phoneNumber")
        .lean(),
      Notification.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "list failed" });
  }
};

/** Quick stats for the admin dashboard / Notifications page. */
export const stats = async (_req: Request, res: Response) => {
  try {
    const [
      deviceTotal,
      anon,
      patients,
      legacyDrivers,
      ambulanceDrivers,
      totalNotifs,
    ] = await Promise.all([
      DeviceToken.countDocuments({ isActive: true }),
      DeviceToken.countDocuments({ isActive: true, role: "anonymous" }),
      DeviceToken.countDocuments({ isActive: true, role: "patient" }),
      DeviceToken.countDocuments({ isActive: true, role: "driver" }),
      AmbulanceStaff.countDocuments({
        isActive: true,
        isDeleted: false,
        // Both drivers and attendants live here — both can receive admin
        // broadcasts under the "DRIVERS" audience.
        fcmToken: { $ne: null },
      }),
      Notification.countDocuments({}),
    ]);
    const drivers = legacyDrivers + ambulanceDrivers;
    const totalDevices = deviceTotal + ambulanceDrivers;
    res.json({
      success: true,
      data: { totalDevices, anon, patients, drivers, totalNotifs },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "stats failed" });
  }
};

/** User search to power the "send to user" picker. */
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      $or: [{ fullName: rx }, { email: rx }, { phoneNumber: rx }],
    })
      .select("fullName email phoneNumber fcmToken")
      .limit(15)
      .lean();
    res.json({ success: true, data: users });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "search failed" });
  }
};

/**
 * Send promotional notification to all users (legacy — uses User.fcmToken).
 * Kept for backward compatibility with existing admin scripts.
 */
export const sendPromoNotification = async (req: Request, res: Response) => {
  try {
    const { title, body, promoCode, targetAudience } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
      });
    }

    const result = await NotificationService.sendPromoNotification(
      title,
      body,
      promoCode,
      targetAudience || "ALL",
    );

    res.json({
      success: true,
      message: "Notification sent",
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send notification",
    });
  }
};

/**
 * Delete old notifications (cleanup)
 */
export const cleanupNotifications = async (req: Request, res: Response) => {
  try {
    const { daysOld = 30 } = req.body;

    const deletedCount = await NotificationService.deleteOldNotifications(
      Number(daysOld),
    );

    res.json({
      success: true,
      message: `Deleted ${deletedCount} old notifications`,
      data: { deletedCount },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cleanup notifications",
    });
  }
};
