import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import AmbulanceStaff from "../models/ambulance-staff.model";
import helpers from "../utils/helpers";
import redis from "../utils/redis";
import config from "../config";
import { sendOtpSms } from "../services/sms.service";

const OTP_TTL_SEC = 600;

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { mobileNumber, countryCode = "+91" } = req.body;

  const staff = await AmbulanceStaff.findOne({
    mobileNumber,
    countryCode,
    isDeleted: false,
  });

  if (!staff || !staff.isActive) {
    return res.status(404).json({
      rCode: 0,
      rMsg: "staff_not_onboarded",
      rData: { hint: "Please contact your operations team to be onboarded." },
    });
  }

  const otp = helpers().generateOTP(6);
  const txnId = uuidv4();
  const record = {
    txnId,
    mobileNumber,
    countryCode,
    otp,
    staffId: String(staff._id),
    reason: "AMBULANCE_STAFF_LOGIN",
    createdAt: Date.now(),
  };

  await redis().SetRedis(
    `AMBSTAFF|txnId:${txnId}`,
    JSON.stringify(record),
    OTP_TTL_SEC,
  );
  await redis().SetRedis(
    `AMBSTAFF|Mob:${mobileNumber}`,
    JSON.stringify(record),
    OTP_TTL_SEC,
  );

  if (config.env !== "production") {
    console.log(`[DEV] Ambulance staff OTP for ${mobileNumber}: ${otp}`);
  }

  // Actually deliver the OTP to the staff member's phone (was console-only
  // before, so on-device login never received a code in production).
  try {
    await sendOtpSms(mobileNumber, String(otp));
  } catch (err) {
    console.error("[AmbStaffAuth] Failed to send login OTP SMS:", err);
  }

  req.rData = { txnId, role: staff.role };
  req.msg = "otp_sent";
  next();
};

export const resendOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  return login(req, res, next);
};

export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { mobileNumber, countryCode = "+91", otp, txnId, fcmToken } = req.body;

  const raw = await redis().GetRedis<any>(`AMBSTAFF|txnId:${txnId}`);
  const rawRecord = Array.isArray(raw) ? raw[0] : raw;

  if (!rawRecord) {
    return res
      .status(401)
      .json({ rCode: 0, rMsg: "invalid_otp", rData: {} });
  }

  const record =
    typeof rawRecord === "string" ? JSON.parse(rawRecord) : rawRecord;

  // Master OTP bypass — same pattern used in patient + driver auth so
  // testers and ops can sign in as any seeded staff without an SMS round
  // trip. Skipped automatically in production via MASTER_OTP unsetting.
  const masterOtp = String(config.auth.masterOtp ?? "").trim();
  const isMaster =
    masterOtp.length > 0 && String(otp).trim() === masterOtp && !!record;

  // txnId already uniquely identifies the OTP record (it's the Redis key), so
  // the mobile/country comparison is a defensive extra — only enforce it when
  // the client actually sent those fields, otherwise a valid OTP would be
  // rejected just because the body omitted mobileNumber.
  const mobileMismatch =
    mobileNumber !== undefined && record.mobileNumber !== mobileNumber;
  const ccMismatch =
    req.body.countryCode !== undefined && record.countryCode !== countryCode;
  if (
    !isMaster &&
    (!record ||
      String(record.otp) !== String(otp) ||
      mobileMismatch ||
      ccMismatch)
  ) {
    return res
      .status(401)
      .json({ rCode: 0, rMsg: "invalid_otp", rData: {} });
  }

  const staff = await AmbulanceStaff.findById(record.staffId);
  if (!staff || !staff.isActive || staff.isDeleted) {
    return res
      .status(401)
      .json({ rCode: 0, rMsg: "account_inactive", rData: {} });
  }

  if (fcmToken) staff.fcmToken = fcmToken;
  staff.lastSeenAt = new Date();
  await staff.save();
  console.log(
    `[FCM] verifyOtp staff=${staff._id} role=${staff.role} fcmTokenInBody=${!!fcmToken}` +
      (fcmToken ? ` tail=${String(fcmToken).slice(-8)}` : ""),
  );

  // Cleanup OTP records
  try {
    await redis().DeleteRedis(`AMBSTAFF|Mob:${mobileNumber}`);
    if (record.txnId) {
      await redis().DeleteRedis(`AMBSTAFF|txnId:${record.txnId}`);
    }
  } catch (err) {
    console.warn("Failed to clean up ambulance staff OTP from Redis:", err);
  }

  const token = jwt.sign(
    {
      staffId: String(staff._id),
      role: staff.role,
      providerId: String(staff.providerId),
    },
    config.auth.jwtSecret,
    { expiresIn: "7d" },
  );

  req.rData = {
    token,
    staff: {
      id: String(staff._id),
      fullName: staff.fullName,
      role: staff.role,
      providerId: String(staff.providerId),
      mobileNumber: staff.mobileNumber,
    },
  };
  req.msg = "login_ok";
  next();
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  await AmbulanceStaff.updateOne(
    { _id: staffId },
    { fcmToken: null, isOnline: false, isDutyOn: false },
  );
  req.rData = {};
  req.msg = "logged_out";
  next();
};
