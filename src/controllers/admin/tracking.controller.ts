import { Request, Response } from "express";
import { Types } from "mongoose";
import * as TrackingService from "../../services/tracking.service";

/**
 * Get drivers on map
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
      message: error.message || "Failed to get drivers on map",
    });
  }
};

/**
 * Get driver location
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
 * Get driver location history
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

/**
 * Find nearby drivers
 */
export const findNearbyDrivers = async (req: Request, res: Response) => {
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
