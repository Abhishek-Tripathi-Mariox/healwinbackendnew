import DriverLocation from "../models/driver-location.model";
import Driver from "../models/driver.model";
import { IDriverLocation } from "../interfaces/driver-location";
import { Types } from "mongoose";

/**
 * Update driver location
 */
export const updateDriverLocation = async (
  driverId: Types.ObjectId,
  latitude: number,
  longitude: number,
  heading?: number,
  speed?: number
) => {
  return await DriverLocation.findOneAndUpdate(
    { driverId },
    {
      location: {
        type: "Point",
        coordinates: [longitude, latitude], // [lng, lat] for GeoJSON
      },
      latitude,
      longitude,
      heading,
      speed,
    },
    { upsert: true, returnDocument: "after" }
  );
};

/**
 * Get driver location
 */
export const getDriverLocation = async (driverId: Types.ObjectId) => {
  return await DriverLocation.findOne({ driverId }).select("-__v");
};

/**
 * Find nearby drivers
 * @param latitude - Center latitude
 * @param longitude - Center longitude
 * @param maxDistanceKm - Maximum distance in kilometers
 * @param vehicleTypeId - Optional vehicle type filter
 */
export const findNearbyDrivers = async (
  latitude: number,
  longitude: number,
  maxDistanceKm: number = 5,
  vehicleTypeId?: Types.ObjectId
) => {
  // First get nearby driver locations using geospatial query
  const nearbyLocations = await DriverLocation.find({
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistanceKm * 1000, // Convert km to meters
      },
    },
  }).limit(50);

  const driverIds = nearbyLocations.map((loc) => loc.driverId);

  // Get available drivers from the nearby list
  const query: any = {
    _id: { $in: driverIds },
    isOnline: true,
    status: "approved",
    isActive: true,
    isDeleted: false,
    currentBookingId: null,
  };

  // If vehicle type is specified, filter by it
  if (vehicleTypeId) {
    const DriverVehicle = require("../models/driver-vehicle.model").default;
    const vehicles = await DriverVehicle.find({
      driverId: { $in: driverIds },
      vehicleTypeId,
      isActive: true,
      isOnline: true,
    });

    const vehicleDriverIds = vehicles.map((v: any) => v.driverId);
    query._id = { $in: vehicleDriverIds };
  }

  const drivers = await Driver.find(query).select("-__v").limit(20);

  // Combine driver data with location data
  return drivers.map((driver) => {
    const location = nearbyLocations.find(
      (loc) => loc.driverId.toString() === driver._id.toString()
    );

    return {
      driver,
      location: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            heading: location.heading,
            speed: location.speed,
          }
        : null,
    };
  });
};

/**
 * Delete driver location
 */
export const deleteDriverLocation = async (driverId: Types.ObjectId) => {
  return await DriverLocation.deleteOne({ driverId });
};
