import mongoose, { Schema, Types } from "mongoose";

/**
 * Tracks every installed app device's FCM token, regardless of login state.
 * - `userId` is set once the user logs in (linked back via update).
 * - `deviceId` is a stable per-install UUID generated client-side, so the
 *   same handset doesn't accumulate stale rows on reinstall.
 * - `role` lets admin broadcasts target patients vs drivers vs anonymous.
 */
export interface IDeviceToken {
  _id: Types.ObjectId;
  fcmToken: string;
  deviceId: string;
  platform: "android" | "ios" | "web";
  role: "patient" | "driver" | "anonymous";
  userId?: Types.ObjectId;
  driverId?: Types.ObjectId;
  appVersion?: string;
  isActive: boolean;
  lastSeenAt: Date;
}

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    fcmToken: { type: String, required: true, unique: true, index: true },
    deviceId: { type: String, required: true, index: true },
    platform: {
      type: String,
      enum: ["android", "ios", "web"],
      required: true,
    },
    role: {
      type: String,
      enum: ["patient", "driver", "anonymous"],
      default: "anonymous",
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    driverId: { type: Schema.Types.ObjectId, ref: "Driver", index: true },
    appVersion: String,
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

DeviceTokenSchema.index({ deviceId: 1, platform: 1 });

export const DeviceToken = mongoose.model<IDeviceToken>(
  "DeviceToken",
  DeviceTokenSchema,
);
