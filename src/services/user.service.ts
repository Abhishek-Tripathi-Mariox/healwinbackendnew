import { Types } from "mongoose";
import User from "../models/Users";
import helpers from "../utils/helpers";
import redis from "../utils/redis";
import { IUser } from "../interfaces/users";

/**
 * Create user
 */
export const addUsers = async (data: Partial<IUser>) => {
  return await User.create(data);
};

/**
 * Fetch user by ID
 */
export const fetch = async (id: string | Types.ObjectId) => {
  return await User.findById(id).select("-password -time -otp");
};

/**
 * Fetch user by query
 */
export const fetchByQuery = async (query: any) => {
  console.log("UserService => fetchByQuery");
  return await User.findOne(query).select("-password");
};

/**
 * Verify password
 */
export const verifyPassword = async (
  id: string | Types.ObjectId,
  password: string
): Promise<boolean> => {
  console.log("UserService => verifyPassword");

  const user: any = await User.findById(id);
  if (!user) return false;

  return await helpers().checkPassword(password, user.password);
};

/**
 * Delete user
 */
export const deleteUser = async (id: string | Types.ObjectId) => {
  return await User.deleteOne({ _id: id });
};

/**
 * Reset password
 */
export const resetPassword = async (
  userId: string | Types.ObjectId,
  password: string
) => {
  console.log("UserService => resetPassword");
  return await User.findByIdAndUpdate(userId, { password });
};

/**
 * Update user
 */
export const updateUsers = async (
  userId: string | Types.ObjectId,
  data: Partial<IUser>
) => {
  console.log("UserService => updateUsers");

  return await User.findByIdAndUpdate(
    userId,
    { $set: data },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

/**
 * Get users list
 */
export const getUser = async (query: any, page = 0, limit = 10) => {
  return await User.find(query)
    .select("-password -__v")
    .sort({ _id: -1 })
    // .skip(page * limit)
    .limit(limit);
};

/**
 * Count users
 */
export const countUser = async (query: any) => {
  return await User.countDocuments(query);
};

/**
 * Redis: set user by txnId
 */
export const setUserInRedisByTxnId = async (otpData: any) => {
  console.log("UsersService => setUserInRedisByTxnId");

  if (!otpData) return;

  const txnId = otpData.txnId;

  try {
    await redis().SetRedis(`USER|txnId:${txnId}`, otpData, 60);
    console.log("SetRedis success");
  } catch (err) {
    console.log("Err=>>", err);
    throw err;
  }
};

/**
 * Redis: set OTP for registration
 */
export const setUserInRedisForReg = async (phoneNo: string, otpData: any) => {
  console.log("UsersService => setUserInRedisForReg");

  if (!otpData) return null;

  const redisKey = `USER_Mob_${phoneNo}`;
  return await setOTPInRedis(redisKey, otpData);
};

/**
 * Redis helpers
 */
const setOTPInRedis = async (redisKey: string, otpData: any) => {
  console.log("UsersService => setOTPInRedis");

  const res = await checkIfOtpExistInRedis(redisKey);
  if (res) return res;

  await redis().SetRedis(redisKey, otpData, 60);
  return null;
};

const checkIfOtpExistInRedis = async (key: string) => {
  console.log("UsersService => checkIfOtpExistInRedis");
  return await redis().GetKeyRedis(key);
};
