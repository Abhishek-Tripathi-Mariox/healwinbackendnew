/**
 * Booking Dispatch Service
 * Handles finding nearby drivers, sending booking requests (bell ringing),
 * and managing the auto-close mechanism when one driver accepts.
 */

import { Types } from "mongoose";
import Booking from "../models/booking.model";
import Driver from "../models/driver.model";
import DriverVehicle from "../models/driver-vehicle.model";
import { getRedisClient, cache } from "../utils/redis.util";
import { getIO, emitToUser, emitToBooking } from "../utils/socket.util";
import * as mqttUtil from "../utils/mqtt.util";
import * as notificationService from "./notification.service";

// Redis keys
const BOOKING_DRIVERS_KEY = "booking:drivers:"; // booking:drivers:{bookingId} -> Set of driver IDs
const DRIVER_PENDING_BOOKING_KEY = "driver:pending:"; // driver:pending:{driverId} -> booking ID
const BOOKING_TIMEOUT_KEY = "booking:timeout:"; // booking:timeout:{bookingId} -> expiry timestamp

// Configuration
const DRIVER_SEARCH_RADIUS_KM = 5; // Initial search radius
const MAX_SEARCH_RADIUS_KM = 15; // Max search radius
const RADIUS_INCREMENT_KM = 3; // Increase radius by this amount
const BOOKING_REQUEST_TIMEOUT_SECONDS = 30; // Time for drivers to accept
const MAX_DRIVERS_TO_NOTIFY = 10; // Max drivers to notify at once

interface NearbyDriver {
  driverId: string;
  distance: number;
  lat: number;
  lng: number;
}

interface BookingDispatchResult {
  success: boolean;
  driversNotified: number;
  driverIds: string[];
  message: string;
}

/**
 * Find nearby available drivers
 */
export const findNearbyDrivers = async (
  pickupLat: number,
  pickupLng: number,
  vehicleTypeId: string,
  radiusKm: number = DRIVER_SEARCH_RADIUS_KM,
): Promise<NearbyDriver[]> => {
  try {
    const redis = getRedisClient();

    // Search for drivers within radius using Redis GeoSearch
    const nearbyDriverIds = await redis.geoSearchWith(
      "driver:locations",
      { longitude: pickupLng, latitude: pickupLat },
      { radius: radiusKm, unit: "km" },
      ["WITHDIST", "WITHCOORD"],
    );

    if (!nearbyDriverIds || nearbyDriverIds.length === 0) {
      return [];
    }

    // Filter by availability and vehicle type
    const availableDrivers: NearbyDriver[] = [];

    for (const result of nearbyDriverIds) {
      const driverId = result.member;
      const distance = result.distance || 0;
      const coords = result.coordinates;

      // Check if driver is online and not on another booking
      const driver = await Driver.findOne({
        _id: driverId,
        isOnline: true,
        isBlocked: { $ne: true },
        kycStatus: "APPROVED",
      }).select("_id isOnline");

      if (!driver) continue;

      // Check if driver has a vehicle of the requested type and it's active
      const hasVehicle = await DriverVehicle.findOne({
        driverId: driverId,
        vehicleTypeId: new Types.ObjectId(vehicleTypeId),
        isActive: true,
        isDeleted: { $ne: true },
      });

      if (!hasVehicle) continue;

      // Check if driver doesn't have an active booking
      const hasActiveBooking = await Booking.findOne({
        driverId: driverId,
        status: {
          $in: ["ASSIGNED", "DRIVER_ARRIVED", "PICKED", "IN_PROGRESS"],
        },
      });

      if (hasActiveBooking) continue;

      // Check if driver doesn't have a pending request
      const pendingBooking = await cache.get(
        `${DRIVER_PENDING_BOOKING_KEY}${driverId}`,
      );
      if (pendingBooking) continue;

      availableDrivers.push({
        driverId: driverId.toString(),
        distance: parseFloat(distance.toString()),
        lat: coords?.latitude || 0,
        lng: coords?.longitude || 0,
      });
    }

    // Sort by distance (nearest first)
    availableDrivers.sort((a, b) => a.distance - b.distance);

    // Limit to max drivers
    return availableDrivers.slice(0, MAX_DRIVERS_TO_NOTIFY);
  } catch (error) {
    console.error("Error finding nearby drivers:", error);
    return [];
  }
};

/**
 * Dispatch booking to nearby drivers (ring the bell)
 */
export const dispatchBookingToDrivers = async (
  bookingId: string,
): Promise<BookingDispatchResult> => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate("vehicleTypeId", "name icon")
      .lean();

    if (!booking) {
      return {
        success: false,
        driversNotified: 0,
        driverIds: [],
        message: "Booking not found",
      };
    }

    // Extract pickup coordinates from IBooking interface
    const pickupLat = booking.pickup?.lat;
    const pickupLng = booking.pickup?.lng;

    if (!pickupLat || !pickupLng) {
      return {
        success: false,
        driversNotified: 0,
        driverIds: [],
        message: "Invalid pickup location",
      };
    }
    const vehicleTypeId =
      booking.vehicleTypeId?._id?.toString() ||
      booking.vehicleTypeId?.toString();

    if (!vehicleTypeId) {
      return {
        success: false,
        driversNotified: 0,
        driverIds: [],
        message: "Invalid vehicle type",
      };
    }

    // Find nearby drivers
    let nearbyDrivers = await findNearbyDrivers(
      pickupLat,
      pickupLng,
      vehicleTypeId,
    );

    // If no drivers found, try expanding the radius
    let currentRadius = DRIVER_SEARCH_RADIUS_KM;
    while (nearbyDrivers.length === 0 && currentRadius < MAX_SEARCH_RADIUS_KM) {
      currentRadius += RADIUS_INCREMENT_KM;
      nearbyDrivers = await findNearbyDrivers(
        pickupLat,
        pickupLng,
        vehicleTypeId,
        currentRadius,
      );
    }

    if (nearbyDrivers.length === 0) {
      // Update booking status
      await Booking.findByIdAndUpdate(bookingId, {
        status: "SEARCHING",
        searchStartedAt: new Date(),
      });

      return {
        success: false,
        driversNotified: 0,
        driverIds: [],
        message: "No available drivers found nearby",
      };
    }

    // Prepare booking data for notification
    const bookingData = {
      bookingId: bookingId,
      pickup: {
        address: booking.pickup?.address || "",
        lat: pickupLat,
        lng: pickupLng,
      },
      drop: {
        address: booking.drop?.address || "",
        lat: booking.drop?.lat || 0,
        lng: booking.drop?.lng || 0,
      },
      distance: booking.distanceKm || 0,
      estimatedFare: booking.finalFare || booking.fare || 0,
      vehicleType: (booking.vehicleTypeId as any)?.name || "Vehicle",
      expiresAt: Date.now() + BOOKING_REQUEST_TIMEOUT_SECONDS * 1000,
    };

    const redis = getRedisClient();
    const io = getIO();
    const notifiedDriverIds: string[] = [];

    // Send request to each nearby driver
    for (const driver of nearbyDrivers) {
      try {
        // Mark driver as having a pending request
        await redis.setEx(
          `${DRIVER_PENDING_BOOKING_KEY}${driver.driverId}`,
          BOOKING_REQUEST_TIMEOUT_SECONDS,
          bookingId,
        );

        // Add driver to booking's notified list
        await redis.sAdd(`${BOOKING_DRIVERS_KEY}${bookingId}`, driver.driverId);

        // Send via Socket.io (primary)
        emitToUser(driver.driverId, "booking:request", {
          ...bookingData,
          driverDistance: driver.distance,
          priority: "high",
          sound: "booking_bell",
        });

        // Send via MQTT (secondary - for reliability)
        await mqttUtil.sendBookingRequestToDriver(driver.driverId, bookingData);

        // Send push notification
        const driverDoc = await Driver.findById(driver.driverId)
          .select("fcmToken")
          .lean();
        if (driverDoc?.fcmToken) {
          await notificationService.sendPushNotification(
            driverDoc.fcmToken,
            "🔔 New Booking Request!",
            `Pickup: ${bookingData.pickup.address.substring(0, 50)}... | ₹${bookingData.estimatedFare}`,
            {
              type: "BOOKING_REQUEST",
              bookingId: bookingId,
              action: "ACCEPT_BOOKING",
            },
          );
        }

        notifiedDriverIds.push(driver.driverId);
      } catch (error) {
        console.error(`Error notifying driver ${driver.driverId}:`, error);
      }
    }

    // Update booking status
    await Booking.findByIdAndUpdate(bookingId, {
      status: "SEARCHING",
      searchStartedAt: new Date(),
    });

    // Set booking timeout to auto-expire the request
    await redis.setEx(
      `${BOOKING_TIMEOUT_KEY}${bookingId}`,
      BOOKING_REQUEST_TIMEOUT_SECONDS,
      "pending",
    );

    // Schedule timeout handler
    setTimeout(async () => {
      await handleBookingTimeout(bookingId);
    }, BOOKING_REQUEST_TIMEOUT_SECONDS * 1000);

    return {
      success: true,
      driversNotified: notifiedDriverIds.length,
      driverIds: notifiedDriverIds,
      message: `Booking request sent to ${notifiedDriverIds.length} drivers`,
    };
  } catch (error: any) {
    console.error("Error dispatching booking:", error);
    return {
      success: false,
      driversNotified: 0,
      driverIds: [],
      message: error.message || "Failed to dispatch booking",
    };
  }
};

/**
 * Handle driver accepting a booking
 * This will close the booking for all other drivers
 */
export const handleDriverAcceptance = async (
  bookingId: string,
  driverId: string,
): Promise<{ success: boolean; message: string }> => {
  try {
    const redis = getRedisClient();

    // Check if booking is still available
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return { success: false, message: "Booking not found" };
    }

    if (booking.status !== "SEARCHING" && booking.status !== "PENDING") {
      return { success: false, message: "Booking is no longer available" };
    }

    if (booking.driverId) {
      return {
        success: false,
        message: "Booking already assigned to another driver",
      };
    }

    // Check if driver was notified about this booking
    const wasNotified = await redis.sIsMember(
      `${BOOKING_DRIVERS_KEY}${bookingId}`,
      driverId,
    );
    if (!wasNotified) {
      return {
        success: false,
        message: "Driver was not notified about this booking",
      };
    }

    // Atomically assign the booking to this driver
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: { $in: ["SEARCHING", "PENDING"] },
        driverId: null,
      },
      {
        $set: {
          driverId: new Types.ObjectId(driverId),
          status: "ASSIGNED",
          assignedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    ).populate("userId", "fullName fcmToken");

    if (!updatedBooking) {
      return {
        success: false,
        message: "Booking already assigned to another driver",
      };
    }

    // Get all drivers who were notified
    const notifiedDrivers = await redis.sMembers(
      `${BOOKING_DRIVERS_KEY}${bookingId}`,
    );

    // Close the booking for all other drivers
    const io = getIO();

    for (const otherDriverId of notifiedDrivers) {
      if (otherDriverId !== driverId) {
        // Remove pending request from driver
        await redis.del(`${DRIVER_PENDING_BOOKING_KEY}${otherDriverId}`);

        // Notify via Socket.io
        emitToUser(otherDriverId, "booking:closed", {
          bookingId,
          reason: "ACCEPTED_BY_OTHER",
          message: "This booking has been accepted by another driver",
        });

        // Notify via MQTT
        await mqttUtil.sendBookingCancelledToDriver(
          otherDriverId,
          bookingId,
          "Booking accepted by another driver",
        );
      }
    }

    // Broadcast to booking topic that it's accepted
    await mqttUtil.sendBookingAcceptedBroadcast(
      bookingId,
      driverId,
      notifiedDrivers,
    );

    // Clean up Redis
    await redis.del(`${BOOKING_DRIVERS_KEY}${bookingId}`);
    await redis.del(`${BOOKING_TIMEOUT_KEY}${bookingId}`);
    await redis.del(`${DRIVER_PENDING_BOOKING_KEY}${driverId}`);

    // Notify user that driver accepted
    const userId =
      updatedBooking.userId?._id?.toString() ||
      updatedBooking.userId?.toString();
    if (userId) {
      const driver = await Driver.findById(driverId)
        .select("fullName mobileNumber profilePhoto rating")
        .lean();

      emitToUser(userId, "booking:accepted", {
        bookingId,
        status: "ASSIGNED",
        driver: {
          _id: driverId,
          fullName: driver?.fullName,
          mobileNumber: driver?.mobileNumber,
          profilePhoto: driver?.profilePhoto,
          rating: driver?.rating,
        },
      });

      // Send push notification to user
      const userFcmToken = (updatedBooking.userId as any)?.fcmToken;
      if (userFcmToken) {
        await notificationService.sendPushNotification(
          userFcmToken,
          "🚗 Driver Assigned!",
          `${driver?.fullName || "Your driver"} has accepted your booking and is on the way.`,
          {
            type: "BOOKING_ACCEPTED",
            bookingId,
            driverId,
          },
        );
      }
    }

    // Emit to booking room
    emitToBooking(bookingId, "booking:status", {
      bookingId,
      status: "ASSIGNED",
      driverId,
    });

    return { success: true, message: "Booking accepted successfully" };
  } catch (error: any) {
    console.error("Error handling driver acceptance:", error);
    return {
      success: false,
      message: error.message || "Failed to accept booking",
    };
  }
};

/**
 * Handle driver rejecting/skipping a booking
 */
export const handleDriverRejection = async (
  bookingId: string,
  driverId: string,
): Promise<{ success: boolean; message: string }> => {
  try {
    const redis = getRedisClient();

    // Remove pending request from driver
    await redis.del(`${DRIVER_PENDING_BOOKING_KEY}${driverId}`);

    // Remove driver from booking's notified list
    await redis.sRem(`${BOOKING_DRIVERS_KEY}${bookingId}`, driverId);

    // Log rejection for analytics
    // TODO: Track rejection patterns

    return { success: true, message: "Booking rejected" };
  } catch (error: any) {
    console.error("Error handling driver rejection:", error);
    return {
      success: false,
      message: error.message || "Failed to reject booking",
    };
  }
};

/**
 * Handle booking request timeout
 */
const handleBookingTimeout = async (bookingId: string): Promise<void> => {
  try {
    const booking = await Booking.findById(bookingId);

    if (!booking || booking.status !== "SEARCHING") {
      return; // Booking was already assigned or cancelled
    }

    // Check if booking is still pending
    const redis = getRedisClient();
    const timeoutKey = await redis.get(`${BOOKING_TIMEOUT_KEY}${bookingId}`);

    if (!timeoutKey) {
      return; // Timeout was cleared (booking accepted)
    }

    // Get notified drivers
    const notifiedDrivers = await redis.sMembers(
      `${BOOKING_DRIVERS_KEY}${bookingId}`,
    );

    // Expand search and retry
    const pickupLat = booking.pickup?.lat;
    const pickupLng = booking.pickup?.lng;
    const vehicleTypeId = booking.vehicleTypeId?.toString();

    if (!vehicleTypeId || !pickupLat || !pickupLng) return;

    // Find new drivers with expanded radius
    const newDrivers = await findNearbyDrivers(
      pickupLat,
      pickupLng,
      vehicleTypeId,
      MAX_SEARCH_RADIUS_KM,
    );

    // Filter out already notified drivers
    const freshDrivers = newDrivers.filter(
      (d) => !notifiedDrivers.includes(d.driverId),
    );

    if (freshDrivers.length > 0) {
      // Retry with new drivers
      console.log(
        `Retrying booking ${bookingId} with ${freshDrivers.length} new drivers`,
      );
      await dispatchBookingToDrivers(bookingId);
    } else {
      // No more drivers available
      const io = getIO();
      const userId = booking.userId?.toString();

      if (userId) {
        emitToUser(userId, "booking:no_drivers", {
          bookingId,
          message: "No drivers available at the moment. Please try again.",
        });
      }

      // Clean up Redis
      await redis.del(`${BOOKING_DRIVERS_KEY}${bookingId}`);
      await redis.del(`${BOOKING_TIMEOUT_KEY}${bookingId}`);

      // Clean up pending requests for all notified drivers
      for (const driverId of notifiedDrivers) {
        await redis.del(`${DRIVER_PENDING_BOOKING_KEY}${driverId}`);
      }
    }
  } catch (error) {
    console.error("Error handling booking timeout:", error);
  }
};

/**
 * Cancel booking dispatch (when user cancels)
 */
export const cancelBookingDispatch = async (
  bookingId: string,
): Promise<void> => {
  try {
    const redis = getRedisClient();
    const io = getIO();

    // Get all notified drivers
    const notifiedDrivers = await redis.sMembers(
      `${BOOKING_DRIVERS_KEY}${bookingId}`,
    );

    // Notify all drivers
    for (const driverId of notifiedDrivers) {
      await redis.del(`${DRIVER_PENDING_BOOKING_KEY}${driverId}`);

      emitToUser(driverId, "booking:cancelled", {
        bookingId,
        reason: "CANCELLED_BY_USER",
        message: "Booking was cancelled by the user",
      });

      await mqttUtil.sendBookingCancelledToDriver(
        driverId,
        bookingId,
        "Cancelled by user",
      );
    }

    // Clean up Redis
    await redis.del(`${BOOKING_DRIVERS_KEY}${bookingId}`);
    await redis.del(`${BOOKING_TIMEOUT_KEY}${bookingId}`);
  } catch (error) {
    console.error("Error cancelling booking dispatch:", error);
  }
};

export default {
  findNearbyDrivers,
  dispatchBookingToDrivers,
  handleDriverAcceptance,
  handleDriverRejection,
  cancelBookingDispatch,
};
