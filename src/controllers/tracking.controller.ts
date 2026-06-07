import { Request, Response } from "express";
import { Types } from "mongoose";
import * as TrackingService from "../services/tracking.service";

/**
 * Get booking tracking info
 */
export const getBookingTracking = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { bookingId } = req.params as Record<string, string>;

    const tracking = await TrackingService.getBookingTracking(
      new Types.ObjectId(bookingId),
      userId,
    );

    res.json({
      success: true,
      data: tracking,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get tracking info",
    });
  }
};

/**
 * Get driver location for booking
 */
export const getDriverLocation = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params as Record<string, string>;

    const location = await TrackingService.getDriverLocation(
      new Types.ObjectId(driverId),
    );

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Driver location not available",
      });
    }

    res.json({
      success: true,
      data: location,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get driver location",
    });
  }
};

/**
 * Get nearby drivers (for map display)
 */
export const getNearbyDrivers = async (req: Request, res: Response) => {
  try {
    const { lat, lng, vehicleTypeId, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Location is required",
      });
    }

    const drivers = await TrackingService.findNearbyDrivers(
      { lat: Number(lat), lng: Number(lng) },
      vehicleTypeId ? new Types.ObjectId(vehicleTypeId as string) : undefined,
      radius ? Number(radius) : undefined,
    );

    res.json({
      success: true,
      data: drivers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to find nearby drivers",
    });
  }
};

// ===== Driver endpoints =====

/**
 * Update driver location
 */
export const updateDriverLocation = async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver._id;
    const { lat, lng, heading, speed, accuracy } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Location is required",
      });
    }

    await TrackingService.updateDriverLocation(driverId, {
      lat,
      lng,
      heading,
      speed,
      accuracy,
    });

    res.json({
      success: true,
      message: "Location updated",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update location",
    });
  }
};

/**
 * Set driver online status
 */
export const setOnlineStatus = async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driver._id;
    const { isOnline, lat, lng } = req.body;

    await TrackingService.setDriverOnlineStatus(
      driverId,
      isOnline,
      lat && lng ? { lat, lng } : undefined,
    );

    res.json({
      success: true,
      message: isOnline ? "You are now online" : "You are now offline",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update status",
    });
  }
};

// ===== Admin endpoints =====

/**
 * Get drivers on map (admin)
 */
export const getDriversOnMap = async (req: Request, res: Response) => {
  try {
    const { north, south, east, west, vehicleTypeId } = req.query;

    const bounds =
      north && south && east && west
        ? {
            north: Number(north),
            south: Number(south),
            east: Number(east),
            west: Number(west),
          }
        : undefined;

    const drivers = await TrackingService.getDriversOnMap(
      bounds,
      vehicleTypeId ? new Types.ObjectId(vehicleTypeId as string) : undefined,
    );

    res.json({
      success: true,
      data: drivers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get drivers",
    });
  }
};

/**
 * Get driver location history (admin)
 */
export const getDriverLocationHistory = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params as Record<string, string>;
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Start and end time are required",
      });
    }

    const history = await TrackingService.getDriverLocationHistory(
      new Types.ObjectId(driverId),
      new Date(startTime as string),
      new Date(endTime as string),
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get location history",
    });
  }
};
