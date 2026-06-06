import { Types } from "mongoose";
import UserAddress from "../models/UserAddress";
import { IUserAddress } from "../interfaces/address";

/**
 * Add address
 */
export const addUserAddress = async (data: Partial<IUserAddress>) => {
  return await UserAddress.create(data);
};

/**
 * Fetch address by ID
 */
export const fetch = async (id: string | Types.ObjectId) => {
  return await UserAddress.findById(id).select("-time -__v");
};

/**
 * Fetch address by query
 */
export const fetchByQuery = async (query: any) => {
  console.log("UserAddressService => fetchByQuery");
  return await UserAddress.findOne(query).sort({ _id: -1 });
};

/**
 * Fetch address for cart
 */
export const fetchByQueryForCart = async (query: any) => {
  console.log("UserAddressService => fetchByQueryForCart");
  return await UserAddress.findOne(query)
    .select("-userId -__v -isActive")
    .sort({ _id: -1 });
};

/**
 * Fetch address to edit
 */
export const fetchByQueryToEdit = async (query: any) => {
  console.log("UserAddressService => fetchByQueryToEdit");
  return await UserAddress.findOne(query);
};

/**
 * Update address
 */
export const updateUserAddress = async (
  userAddressId: string | Types.ObjectId,
  data: Partial<IUserAddress>
) => {
  console.log("UserAddressService => updateUserAddress");
  return await UserAddress.findByIdAndUpdate(userAddressId, data, {
    returnDocument: "after",
  });
};

/**
 * Get address list
 */
export const getUserAddress = async (query: any, page = 0, limit = 10) => {
  return await UserAddress.find(query)
    .select("-__v")
    .sort({ _id: -1 })
    // .skip(page * limit)
    .limit(limit);
};

/**
 * Count addresses
 */
export const countUserAddress = async (query: any) => {
  return await UserAddress.countDocuments(query);
};

/**
 * Delete address
 */
export const deleteUserAddress = async (id: string | Types.ObjectId) => {
  return await UserAddress.deleteOne({ _id: id });
};
