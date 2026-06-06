import { Request, Response } from "express";
import { Types } from "mongoose";
import * as NotificationService from "../services/notification.service";

/**
 * Get user notifications
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { page = 1, limit = 20 } = req.query;

    const result = await NotificationService.getUserNotifications(
      userId,
      Number(page),
      Number(limit),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch notifications",
    });
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { notificationId } = req.params;

    await NotificationService.markAsRead(
      new Types.ObjectId(notificationId),
      userId,
    );

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read",
    });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    await NotificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notifications as read",
    });
  }
};

/**
 * Get unread count
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const result = await NotificationService.getUserNotifications(userId, 1, 1);

    res.json({
      success: true,
      data: {
        unreadCount: result.unreadCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get unread count",
    });
  }
};

/**
 * Update FCM token
 */
export const updateFcmToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    // Update user's FCM token
    const User = require("../models/Users").default;
    await User.findByIdAndUpdate(userId, { fcmToken });

    res.json({
      success: true,
      message: "FCM token updated",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update FCM token",
    });
  }
};

/**
 * Toggle notification settings
 */
export const toggleNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { enabled, type } = req.body;

    const User = require("../models/Users").default;

    if (type) {
      // Toggle specific notification type
      await User.findByIdAndUpdate(userId, {
        [`notificationSettings.${type}`]: enabled,
      });
    } else {
      // Toggle all notifications
      await User.findByIdAndUpdate(userId, {
        isNotificationEnabled: enabled,
      });
    }

    res.json({
      success: true,
      message: "Notification settings updated",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update notification settings",
    });
  }
};

/**
 * Get notification settings
 */
export const getNotificationSettings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const User = require("../models/Users").default;
    const user = await User.findById(userId).select(
      "isNotificationEnabled notificationSettings",
    );

    res.json({
      success: true,
      data: {
        enabled: user?.isNotificationEnabled ?? true,
        settings: user?.notificationSettings || {
          booking: true,
          payment: true,
          promo: true,
          system: true,
          chat: true,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get notification settings",
    });
  }
};
