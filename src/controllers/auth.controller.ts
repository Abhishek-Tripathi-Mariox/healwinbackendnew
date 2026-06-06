import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

import * as UserService from "../services/user.service";
import { sendOtpSms } from "../services/sms.service";
import helpers from "../utils/helpers";
import redis from "../utils/redis";
import config from "../config";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("AuthController => login");

  const { mobileNumber } = req.body;

  const otp = helpers().generateOTP(6);
  const mobileQuery = { mobileNumber };

  const user = await UserService.fetchByQuery(mobileQuery);

  // Fresh txnId on every request. Reusing the previous txnId (old behavior)
  // caused the SMS OTP to be tied to a new Redis entry while the client
  // kept referencing the stale entry — verification always failed.
  const txnId = uuidv4();

  const otpData = {
    txnId,
    mobileNumber,
    otp,
    reason: "OTP LOGIN LINK APP",
    is_active: 1,
    date_created: new Date(),
    date_modified: new Date(),
  };

  await UserService.setUserInRedisByTxnId(otpData);
  await UserService.setUserInRedisForReg(mobileNumber, otpData);

  // Send OTP via SMS
  try {
    await sendOtpSms(mobileNumber, String(otp));
  } catch (err) {
    console.error("[Auth] Failed to send login OTP SMS:", err);
  }

  req.rData = {
    userRegister: !!user,
    txnId,
  };

  req.msg = "otp_sent";
  next();
};

export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("AuthController => verifyOtp");

  const { otp, txnId } = req.body;

  // 1️⃣ Fetch OTP data from Redis using txnId
  const redisKey = `USER|txnId:${txnId}`;
  const redisKeys = await redis().GetKeys(redisKey);

  console.log("Redis Keys:", redisKeys);
  console.log("Provided OTP:", otp);
  console.log("Redis Key:", redisKey);
  if (!redisKeys.length) {
    req.rCode = 0;
    req.msg = "incorrect_otp";
    return next();
  }

  const result = await redis().GetRedis<any>(redisKeys[0]);

  console.log("OTP Data from Redis:", result);

  if (!result?.[0]) {
    req.rCode = 0;
    req.msg = "incorrect_otp";
    return next();
  }

  const otpData = result[0];
  const mobileNumber = otpData.mobileNumber;

  console.log("Fetched OTP Data:", otpData);
  console.log("Mobile Number:", mobileNumber);

  // Compare as strings: the client sends a JSON string and helpers().generateOTP
  // returns a number, so `===`/`!==` would always be false without this.
  const providedOtp = String(otp).trim();
  const storedOtp = String(otpData.otp).trim();
  const masterOtp = String(config.auth.masterOtp).trim();

  // 2️⃣ MASTER OTP CHECK (skip OTP validation)
  if (providedOtp === masterOtp) {
    let user = await UserService.fetchByQuery({ mobileNumber });

    console.log("User fetched for master OTP:", user);
    if (!user) {
      user = await UserService.addUsers({ mobileNumber });
    }

    const token = helpers().createJWT({ userId: user._id });
    await UserService.updateUsers(user._id, { token });

    req.rData = { token, userId: user._id };
    req.msg = "otp_verified";
    return next();
  }

  // 3️⃣ NORMAL OTP VALIDATION
  if (providedOtp !== storedOtp) {
    req.rCode = 0;
    req.msg = "incorrect_otp";
    return next();
  }

  // 4️⃣ User handling
  let user = await UserService.fetchByQuery({ mobileNumber });

  if (!user) {
    user = await UserService.addUsers({ mobileNumber });
  }

  const token = helpers().createJWT({ userId: user._id });
  await UserService.updateUsers(user._id, { token });

  req.rData = { token, userId: user._id };
  req.msg = "otp_verified";
  next();
};

export const resendOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("AuthController => resendOtp");

  const { countryCode, mobileNumber } = req.body;

  const otp = helpers().generateOTP(6);
  const user = await UserService.fetchByQuery({ countryCode, mobileNumber });

  const newTxnId = uuidv4();

  const otpData = {
    txnId: newTxnId,
    mobileNumber,
    otp,
    reason: "OTP RESEND LINK APP",
    is_active: 1,
    date_created: new Date(),
    date_modified: new Date(),
    countryCode,
  };

  await UserService.setUserInRedisByTxnId(otpData);
  await UserService.setUserInRedisForReg(mobileNumber, otpData);

  // Send OTP via SMS
  try {
    await sendOtpSms(mobileNumber, String(otp));
  } catch (err) {
    console.error("[Auth] Failed to send resend OTP SMS:", err);
  }

  req.rData = {
    userRegister: !!user,
    txnId: newTxnId,
  };

  req.msg = "otp_sent";
  next();
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("AuthController => logout");

  const { userId } = req.body;

  await UserService.updateUsers(userId, {
    deviceToken: null,
    deviceType: null,
    token: null,
  });

  req.msg = "logout";
  next();
};
