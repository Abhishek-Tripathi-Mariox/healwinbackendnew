import { Types } from "mongoose";
import DriverLocation from "../models/driver-location.model";
import Booking from "../models/booking.model";
import Driver from "../models/driver.model";
import { cache } from "../utils/redis.util";
import socketUtils from "../utils/socket.util";

const LOCATION_CACHE_TTL = 60; // 1 minute
const NEARBY_DRIVER_RADIUS = 5000; // 5km in meters

/**
 * Update driver location
 */
export const updateDriverLocation = async (
  driverId: Types.ObjectId,
  location: {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
  },
): Promise<void> => {
  const now = new Date();

  // Update in database
  await DriverLocation.findOneAndUpdate(
    { driverId },
    {
      driverId,
      location: {
        type: "Point",
        coordinates: [location.lng, location.lat],
      },
      heading: location.heading || 0,
      speed: location.speed || 0,
      accuracy: location.accuracy || 0,
      lastUpdated: now,
      isOnline: true,
    },
    { upsert: true },
  );

  // Cache in Redis for quick access
  await cache.set(
    `driver:location:${driverId}`,
    {
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      speed: location.speed,
      updatedAt: now.toISOString(),
    },
    LOCATION_CACHE_TTL,
  );

  // Check if driver has active booking, emit to user
  const activeBooking = await Booking.findOne({
    driverId,
    status: { $in: ["ASSIGNED", "DRIVER_ARRIVED", "PICKED_UP", "IN_TRANSIT"] },
  });

  if (activeBooking) {
    const io = socketUtils.getIO();
    if (io) {
      io.to(`booking:${activeBooking._id}`).emit("driver:location", {
        bookingId: activeBooking._id,
        driverId,
        location: {
          lat: location.lat,
          lng: location.lng,
          heading: location.heading,
          speed: location.speed,
        },
        updatedAt: now,
      });
    }
  }
};

/**
 * Get driver location
 */
export const getDriverLocation = async (
  driverId: Types.ObjectId,
): Promise<{
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: string;
} | null> => {
  // Try cache first
  const cached = await cache.get<any>(`driver:location:${driverId}`);
  if (cached) {
    return cached;
  }

  // Fallback to database
  const location = await DriverLocation.findOne({ driverId });
  if (location) {
    return {
      lat: location.location.coordinates[1],
      lng: location.location.coordinates[0],
      heading: location.heading,
      speed: location.speed,
      updatedAt: location.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  return null;
};

/**
 * Get booking tracking info
 */
export const getBookingTracking = async (
  bookingId: Types.ObjectId,
  userId: Types.ObjectId,
) => {
  const booking = await Booking.findOne({ _id: bookingId, userId })
    .populate(
      "driverId",
      "name mobileNumber profileImage rating vehicleNumber vehicleModel",
    )
    .populate("vehicleTypeId", "name icon");

  if (!booking) {
    throw new Error("Booking not found");
  }

  let driverLocation = null;
  let eta = null;

  if (booking.driverId) {
    driverLocation = await getDriverLocation(booking.driverId._id);

    // Calculate ETA based on current location and destination
    if (driverLocation) {
      eta = await calculateETA(
        { lat: driverLocation.lat, lng: driverLocation.lng },
        booking.status === "ASSIGNED" || booking.status === "DRIVER_ARRIVED"
          ? {
              lat: booking.pickup.lat,
              lng: booking.pickup.lng,
            }
          : {
              lat: booking.drop.lat,
              lng: booking.drop.lng,
            },
      );
    }
  }

  return {
    booking: {
      _id: booking._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      pickup: booking.pickup,
      drop: booking.drop,
      stops: booking.stops,
    },
    driver: booking.driverId,
    vehicleType: booking.vehicleTypeId,
    driverLocation,
    eta,
    statusTimeline: getStatusTimeline(booking),
  };
};

/**
 * Calculate ETA between two points
 */
const calculateETA = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<{ distance: number; duration: number; durationText: string }> => {
  // In production, use Google Maps Distance Matrix API
  // For now, calculate straight-line distance and estimate
  const R = 6371; // Earth's radius in km
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(destination.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // Estimate 3 minutes per km in city traffic
  const duration = Math.ceil(distance * 3);

  return {
    distance: Math.round(distance * 10) / 10, // km with 1 decimal
    duration, // minutes
    durationText:
      duration < 60
        ? `${duration} mins`
        : `${Math.floor(duration / 60)} hr ${duration % 60} mins`,
  };
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Get status timeline for booking
 */
const getStatusTimeline = (booking: any) => {
  const timeline: {
    status: string;
    label: string;
    time?: Date;
    completed: boolean;
  }[] = [
    {
      status: "CONFIRMED",
      label: "Booking Confirmed",
      completed: true,
      time: booking.createdAt,
    },
  ];

  const statuses = [
    "ASSIGNED",
    "DRIVER_ARRIVED",
    "PICKED_UP",
    "IN_TRANSIT",
    "COMPLETED",
  ];
  const statusLabels: Record<string, string> = {
    ASSIGNED: "Driver Assigned",
    DRIVER_ARRIVED: "Driver Arrived",
    PICKED_UP: "Goods Picked Up",
    IN_TRANSIT: "On the Way",
    COMPLETED: "Delivered",
  };

  const currentIndex = statuses.indexOf(booking.status);

  statuses.forEach((status, index) => {
    timeline.push({
      status,
      label: statusLabels[status],
      completed: index <= currentIndex,
      time:
        index <= currentIndex
          ? booking[`${status.toLowerCase()}At`]
          : undefined,
    });
  });

  return timeline;
};

/**
 * Find nearby drivers
 */
export const findNearbyDrivers = async (
  location: { lat: number; lng: number },
  vehicleTypeId?: Types.ObjectId,
  radiusMeters: number = NEARBY_DRIVER_RADIUS,
): Promise<any[]> => {
  const query: any = {
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [location.lng, location.lat],
        },
        $maxDistance: radiusMeters,
      },
    },
    isOnline: true,
    lastUpdated: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Active in last 5 mins
  };

  const driverLocations = await DriverLocation.find(query)
    .populate({
      path: "driverId",
      select: "name profileImage rating isAvailable vehicleTypeId",
      match: {
        isAvailable: true,
        isActive: true,
        ...(vehicleTypeId ? { vehicleTypeId } : {}),
      },
    })
    .limit(20);

  return driverLocations
    .filter((dl) => dl.driverId) // Filter out non-matching drivers
    .map((dl) => ({
      driver: dl.driverId,
      location: {
        lat: dl.location.coordinates[1],
        lng: dl.location.coordinates[0],
      },
      heading: dl.heading,
      distance: calculateDistance(
        location.lat,
        location.lng,
        dl.location.coordinates[1],
        dl.location.coordinates[0],
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Calculate distance between two points (in km)
 */
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
};

/**
 * Set driver online/offline
 */
export const setDriverOnlineStatus = async (
  driverId: Types.ObjectId,
  isOnline: boolean,
  location?: { lat: number; lng: number },
): Promise<void> => {
  if (isOnline && location) {
    await DriverLocation.findOneAndUpdate(
      { driverId },
      {
        driverId,
        location: {
          type: "Point",
          coordinates: [location.lng, location.lat],
        },
        isOnline: true,
        lastUpdated: new Date(),
      },
      { upsert: true },
    );
  } else {
    await DriverLocation.findOneAndUpdate(
      { driverId },
      { isOnline: false, lastUpdated: new Date() },
    );
  }

  // Update driver status
  await Driver.findByIdAndUpdate(driverId, { isOnline, isAvailable: isOnline });

  // Clear cache
  await cache.del(`driver:location:${driverId}`);
};

/**
 * Get drivers on map (for admin)
 */
export const getDriversOnMap = async (
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  vehicleTypeId?: Types.ObjectId,
) => {
  const query: any = {
    isOnline: true,
    lastUpdated: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
  };

  if (bounds) {
    query.location = {
      $geoWithin: {
        $box: [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
      },
    };
  }

  const driverLocations = await DriverLocation.find(query)
    .populate({
      path: "driverId",
      select: "name profileImage isAvailable vehicleTypeId currentBookingId",
      ...(vehicleTypeId ? { match: { vehicleTypeId } } : {}),
    })
    .limit(500);

  return driverLocations
    .filter((dl) => dl.driverId)
    .map((dl: any) => ({
      driverId: dl.driverId._id,
      name: dl.driverId.name,
      profileImage: dl.driverId.profileImage,
      isAvailable: dl.driverId.isAvailable,
      hasActiveBooking: !!dl.driverId.currentBookingId,
      location: {
        lat: dl.location.coordinates[1],
        lng: dl.location.coordinates[0],
      },
      heading: dl.heading,
      lastUpdated: dl.lastUpdated,
    }));
};

/**
 * Get driver location history (for debugging/admin)
 */
export const getDriverLocationHistory = async (
  driverId: Types.ObjectId,
  startTime: Date,
  endTime: Date,
): Promise<any[]> => {
  // In production, store location history in a separate collection
  // For now, return empty
  return [];
};

/**
 * Subscribe to booking updates
 */
export const subscribeToBooking = async (
  bookingId: Types.ObjectId,
  socketId: string,
): Promise<void> => {
  const io = socketUtils.getIO();
  if (io) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(`booking:${bookingId}`);
    }
  }
};

/**
 * Unsubscribe from booking updates
 */
export const unsubscribeFromBooking = async (
  bookingId: Types.ObjectId,
  socketId: string,
): Promise<void> => {
  const io = socketUtils.getIO();
  if (io) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(`booking:${bookingId}`);
    }
  }
};
