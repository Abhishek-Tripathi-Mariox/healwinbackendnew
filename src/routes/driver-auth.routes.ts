import { Router } from "express";

import * as DriverAuthController from "../controllers/driver-auth.controller";
import DriverAuthValidator from "../validators/driver-auth.validator";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import DriverAuthMiddleware from "../middlewares/driver-auth.middleware";
import upload from "../middlewares/upload.middleware";
import { rateLimiters } from "../middlewares/rate-limit.middleware";

const driverAuthRouter = Router();

/**
 * Driver Login - Step 1
 */
driverAuthRouter.post(
  "/login",
  rateLimiters.otpSend,
  DriverAuthValidator().validateLogin,
  ErrorHandlerMiddleware(DriverAuthController.driverLogin),
  ResponseMiddleware,
);

/**
 * Verify OTP - Step 2
 */
driverAuthRouter.post(
  "/verify-otp",
  rateLimiters.otpVerify,
  DriverAuthValidator().validateOtp,
  ErrorHandlerMiddleware(DriverAuthController.verifyDriverOtp),
  ResponseMiddleware,
);

/**
 * Resend OTP
 */
driverAuthRouter.post(
  "/resend-otp",
  rateLimiters.otpSend,
  DriverAuthValidator().validateLogin,
  ErrorHandlerMiddleware(DriverAuthController.resendDriverOtp),
  ResponseMiddleware,
);

/**
 * Personal Info - Step 3
 */
driverAuthRouter.put(
  "/personal-info",
  DriverAuthMiddleware().verifyDriverToken,
  DriverAuthValidator().validatePersonalInfo,
  ErrorHandlerMiddleware(DriverAuthController.updatePersonalInfo),
  ResponseMiddleware,
);

driverAuthRouter.get(
  "/details",
  DriverAuthMiddleware().verifyDriverToken,
  ErrorHandlerMiddleware(DriverAuthController.getDriverDetails),
  ResponseMiddleware,
);

/**
 * KYC Documents - Step 4
 */
driverAuthRouter.post(
  "/kyc/aadhaar",
  DriverAuthMiddleware().verifyDriverToken,
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
  ]),
  DriverAuthValidator().validateAadhaar,
  ErrorHandlerMiddleware(DriverAuthController.uploadAadhaar),
  ResponseMiddleware,
);

driverAuthRouter.post(
  "/kyc/pan",
  DriverAuthMiddleware().verifyDriverToken,
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 }, // optional but allowed
  ]),
  DriverAuthValidator().validatePan,
  ErrorHandlerMiddleware(DriverAuthController.uploadPan),
  ResponseMiddleware,
);

driverAuthRouter.post(
  "/kyc/driving-license",
  DriverAuthMiddleware().verifyDriverToken,
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
  ]),
  DriverAuthValidator().validateDrivingLicense,
  ErrorHandlerMiddleware(DriverAuthController.uploadDrivingLicense),
  ResponseMiddleware,
);

driverAuthRouter.post(
  "/kyc/selfie",
  DriverAuthMiddleware().verifyDriverToken,
  upload.fields([{ name: "selfieImage", maxCount: 1 }]),
  DriverAuthValidator().validateSelfie,
  ErrorHandlerMiddleware(DriverAuthController.uploadSelfie),
  ResponseMiddleware,
);

driverAuthRouter.post(
  "/kyc/rc",
  DriverAuthMiddleware().verifyDriverToken,
  upload.any(),
  DriverAuthValidator().validateRC,
  ErrorHandlerMiddleware(DriverAuthController.uploadRC),
  ResponseMiddleware,
);

/**
 * Vehicle Info - Step 5
 */
driverAuthRouter.post(
  "/vehicle",
  DriverAuthMiddleware().verifyDriverToken,
  DriverAuthValidator().validateVehicle,
  ErrorHandlerMiddleware(DriverAuthController.addVehicle),
  ResponseMiddleware,
);

/**
 * Submit for Verification - Final Step
 */
driverAuthRouter.post(
  "/submit-verification",
  DriverAuthMiddleware().verifyDriverToken,
  ErrorHandlerMiddleware(DriverAuthController.submitForVerification),
  ResponseMiddleware,
);

/**
 * Get Onboarding Status
 */
driverAuthRouter.get(
  "/onboarding-status",
  DriverAuthMiddleware().verifyDriverToken,
  ErrorHandlerMiddleware(DriverAuthController.getOnboardingStatus),
  ResponseMiddleware,
);

/**
 * Logout
 */
driverAuthRouter.post(
  "/logout",
  DriverAuthMiddleware().verifyDriverToken,
  ErrorHandlerMiddleware(DriverAuthController.driverLogout),
  ResponseMiddleware,
);

export default driverAuthRouter;
