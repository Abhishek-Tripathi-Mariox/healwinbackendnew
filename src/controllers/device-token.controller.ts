import { Request, Response } from "express";
import { DeviceToken } from "../models/device-token.model";
import User from "../models/Users";

/**
 * Public token registration — works for not-logged-in installs.
 * Logged-in users (when the request carries a verified token) get linked
 * to their userId so admin can target them by user.
 */
export const registerDevice = async (req: Request, res: Response) => {
  try {
    const {
      fcmToken,
      deviceId,
      platform = "android",
      appVersion,
    } = req.body || {};

    if (!fcmToken || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "fcmToken and deviceId are required",
      });
    }
    if (!["android", "ios", "web"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "platform must be android | ios | web",
      });
    }

    const userId = (req as any).user?._id;

    const update: any = {
      fcmToken,
      deviceId,
      platform,
      appVersion,
      isActive: true,
      lastSeenAt: new Date(),
      role: userId ? "patient" : "anonymous",
    };
    if (userId) update.userId = userId;

    await DeviceToken.findOneAndUpdate({ fcmToken }, update, {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    });

    if (userId) {
      await User.findByIdAndUpdate(userId, { fcmToken });
    }

    res.json({ success: true });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "register failed" });
  }
};

/** Called on logout so we don't keep pushing personalised content. */
export const unregisterDevice = async (req: Request, res: Response) => {
  try {
    const { fcmToken } = req.body || {};
    if (!fcmToken) {
      return res
        .status(400)
        .json({ success: false, message: "fcmToken is required" });
    }
    await DeviceToken.findOneAndUpdate(
      { fcmToken },
      { $unset: { userId: 1 }, role: "anonymous", lastSeenAt: new Date() },
    );
    res.json({ success: true });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, message: error.message || "unregister failed" });
  }
};
