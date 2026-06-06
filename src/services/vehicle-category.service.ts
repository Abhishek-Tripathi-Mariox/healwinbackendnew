import VehicleCategory from "../models/vehicle-category.model";
import { IVehicleCategory } from "../interfaces/vehicle-category";
import { Types } from "mongoose";

/**
 * Create vehicle category
 */
export const createVehicleCategory = async (
  data: Partial<IVehicleCategory>
) => {
  return await VehicleCategory.create(data);
};

/**
 * Get vehicle category by ID
 */
export const getVehicleCategoryById = async (id: string | Types.ObjectId) => {
  return await VehicleCategory.findById(id).select("-__v");
};

/**
 * Get vehicle category by code
 */
export const getVehicleCategoryByCode = async (code: string) => {
  return await VehicleCategory.findOne({ code, isActive: true });
};

/**
 * Get all active vehicle categories
 */
export const getActiveVehicleCategories = async () => {
  return await VehicleCategory.find({ isActive: true })
    .select("-__v")
    .sort({ name: 1 });
};

/**
 * Update vehicle category
 */
export const updateVehicleCategory = async (
  categoryId: string | Types.ObjectId,
  data: Partial<IVehicleCategory>
) => {
  return await VehicleCategory.findByIdAndUpdate(
    categoryId,
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
};

/**
 * Delete vehicle category
 */
export const deleteVehicleCategory = async (
  categoryId: string | Types.ObjectId
) => {
  return await VehicleCategory.findByIdAndUpdate(
    categoryId,
    { isActive: false },
    { returnDocument: "after" }
  );
};
