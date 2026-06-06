import { Request, Response } from "express";
import {
  FareConfig,
  AppConfig,
  ServiceArea,
} from "../../models/app-config.model";
import VehicleType from "../../models/vehicle-type.model";
import VehicleCategory from "../../models/vehicle-category.model";
import ServiceType from "../../models/service-type.model";
import AddonService from "../../models/addon-service.model";
import CancellationReason from "../../models/cancellation-reason.model";
import { TimeSlot, ScheduleConfig } from "../../models/time-slot.model";
import GoodsType from "../../models/goods-type.model";

// ============ FARE CONFIG ============

/**
 * Get fare configuration
 */
export const getFareConfig = async (req: Request, res: Response) => {
  let config = await FareConfig.findOne({ isActive: true });

  if (!config) {
    // Create default config
    config = await FareConfig.create({
      name: "default",
      gstPercentage: 5,
      platformFeePercentage: 10,
      minimumFare: 50,
    });
  }

  res.locals.data = { config };
};

/**
 * Update fare configuration
 */
export const updateFareConfig = async (req: Request, res: Response) => {
  const updateData = req.body;

  const config = await FareConfig.findOneAndUpdate(
    { isActive: true },
    updateData,
    { returnDocument: "after", upsert: true },
  );

  res.locals.data = {
    message: "Fare configuration updated",
    config,
  };
};

// ============ VEHICLE TYPES ============

/**
 * Get all vehicle types
 */
export const getVehicleTypes = async (req: Request, res: Response) => {
  const vehicleTypes = await VehicleType.find().sort({ sortOrder: 1, name: 1 });

  res.locals.data = { vehicleTypes };
};

/**
 * Create vehicle type
 */
export const createVehicleType = async (req: Request, res: Response) => {
  const vehicleType = await VehicleType.create(req.body);

  res.locals.data = {
    message: "Vehicle type created",
    vehicleType,
  };
};

/**
 * Update vehicle type
 */
export const updateVehicleType = async (req: Request, res: Response) => {
  const { id } = req.params;

  const vehicleType = await VehicleType.findByIdAndUpdate(id, req.body, {
    returnDocument: "after",
  });

  if (!vehicleType) {
    return res.status(404).json({
      success: false,
      message: "Vehicle type not found",
    });
  }

  res.locals.data = {
    message: "Vehicle type updated",
    vehicleType,
  };
};

/**
 * Toggle vehicle type active status
 */
export const toggleVehicleType = async (req: Request, res: Response) => {
  const { id } = req.params;

  const vehicleType = await VehicleType.findById(id);

  if (!vehicleType) {
    return res.status(404).json({
      success: false,
      message: "Vehicle type not found",
    });
  }

  vehicleType.isActive = !vehicleType.isActive;
  await vehicleType.save();

  res.locals.data = {
    message: `Vehicle type ${vehicleType.isActive ? "activated" : "deactivated"}`,
    vehicleType,
  };
};

/**
 * Soft delete vehicle type
 */
export const deleteVehicleType = async (req: Request, res: Response) => {
  const { id } = req.params;

  const vehicleType = await VehicleType.findByIdAndUpdate(
    id,
    { isDeleted: true, isActive: false },
    { returnDocument: "after" },
  );

  if (!vehicleType) {
    return res.status(404).json({
      success: false,
      message: "Vehicle type not found",
    });
  }

  res.locals.data = {
    message: "Vehicle type deleted",
    vehicleType,
  };
};

/**
 * Restore deleted vehicle type
 */
export const restoreVehicleType = async (req: Request, res: Response) => {
  const { id } = req.params;

  const vehicleType = await VehicleType.findByIdAndUpdate(
    id,
    { isDeleted: false },
    { returnDocument: "after" },
  );

  if (!vehicleType) {
    return res.status(404).json({
      success: false,
      message: "Vehicle type not found",
    });
  }

  res.locals.data = {
    message: "Vehicle type restored",
    vehicleType,
  };
};

// ============ SERVICE TYPES ============

/**
 * Get service types
 */
export const getServiceTypes = async (req: Request, res: Response) => {
  const serviceTypes = await ServiceType.find({ isActive: true }).sort({
    sortOrder: 1,
  });

  res.locals.data = { serviceTypes };
};

/**
 * Create/Update service type
 */
export const upsertServiceType = async (req: Request, res: Response) => {
  const { code, ...data } = req.body;

  const serviceType = await ServiceType.findOneAndUpdate(
    { code },
    { code, ...data },
    { returnDocument: "after", upsert: true },
  );

  res.locals.data = {
    message: "Service type saved",
    serviceType,
  };
};

// ============ ADDON SERVICES ============

/**
 * Get addon services
 */
export const getAddonServices = async (req: Request, res: Response) => {
  const addons = await AddonService.find({ isActive: true })
    .populate("applicableVehicleTypes", "name")
    .sort({ sortOrder: 1 });

  res.locals.data = { addons };
};

/**
 * Create addon service
 */
export const createAddonService = async (req: Request, res: Response) => {
  const addon = await AddonService.create(req.body);

  res.locals.data = {
    message: "Addon service created",
    addon,
  };
};

/**
 * Update addon service
 */
export const updateAddonService = async (req: Request, res: Response) => {
  const { id } = req.params;

  const addon = await AddonService.findByIdAndUpdate(id, req.body, {
    returnDocument: "after",
  });

  res.locals.data = {
    message: "Addon service updated",
    addon,
  };
};

// ============ CANCELLATION REASONS ============

/**
 * Get cancellation reasons
 */
export const getCancellationReasons = async (req: Request, res: Response) => {
  const reasons = await CancellationReason.find({ isActive: true }).sort({
    sortOrder: 1,
  });

  res.locals.data = { reasons };
};

/**
 * Create/Update cancellation reason
 */
export const upsertCancellationReason = async (req: Request, res: Response) => {
  const { code, ...data } = req.body;

  const reason = await CancellationReason.findOneAndUpdate(
    { code },
    { code, ...data },
    { returnDocument: "after", upsert: true },
  );

  res.locals.data = {
    message: "Cancellation reason saved",
    reason,
  };
};

// ============ TIME SLOTS ============

/**
 * Get time slots
 */
export const getTimeSlots = async (req: Request, res: Response) => {
  const slots = await TimeSlot.find({ isActive: true }).sort({ sortOrder: 1 });
  const scheduleConfig = await ScheduleConfig.findOne();

  res.locals.data = {
    slots,
    scheduleConfig: scheduleConfig || {
      advanceBookingDays: 7,
      minAdvanceHours: 2,
      isSchedulingEnabled: true,
    },
  };
};

/**
 * Update schedule config
 */
export const updateScheduleConfig = async (req: Request, res: Response) => {
  const config = await ScheduleConfig.findOneAndUpdate({}, req.body, {
    returnDocument: "after",
    upsert: true,
  });

  res.locals.data = {
    message: "Schedule config updated",
    config,
  };
};

// ============ GOODS TYPES ============

/**
 * Get goods types
 */
export const getGoodsTypes = async (req: Request, res: Response) => {
  const goodsTypes = await GoodsType.find({ isActive: true }).sort({
    category: 1,
    sortOrder: 1,
  });

  res.locals.data = { goodsTypes };
};

// ============ APP SETTINGS ============

/**
 * Get app settings
 */
export const getAppSettings = async (req: Request, res: Response) => {
  const { category } = req.query;

  const query: any = {};
  if (category) query.category = category;

  const settings = await AppConfig.find(query).sort({ category: 1, key: 1 });

  res.locals.data = { settings };
};

/**
 * Update app setting
 */
export const updateAppSetting = async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;

  const setting = await AppConfig.findOneAndUpdate(
    { key },
    { value },
    { returnDocument: "after" },
  );

  if (!setting) {
    return res.status(404).json({
      success: false,
      message: "Setting not found",
    });
  }

  res.locals.data = {
    message: "Setting updated",
    setting,
  };
};

/**
 * Create app setting
 */
export const createAppSetting = async (req: Request, res: Response) => {
  const { key, value, type, category, description } = req.body;

  const existing = await AppConfig.findOne({ key });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Setting key already exists",
    });
  }

  const setting = await AppConfig.create({
    key,
    value,
    type: type || "STRING",
    category,
    description,
  });

  res.locals.data = {
    message: "Setting created",
    setting,
  };
};

// ============ SERVICE AREAS ============

/**
 * Get service areas
 */
export const getServiceAreas = async (req: Request, res: Response) => {
  const areas = await ServiceArea.find({ isActive: true });

  res.locals.data = { areas };
};

/**
 * Create/Update service area
 */
export const upsertServiceArea = async (req: Request, res: Response) => {
  const { id, ...data } = req.body;

  let area;
  if (id) {
    area = await ServiceArea.findByIdAndUpdate(id, data, { returnDocument: "after" });
  } else {
    area = await ServiceArea.create(data);
  }

  res.locals.data = {
    message: "Service area saved",
    area,
  };
};
