import { Router } from "express";
import * as C from "../controllers/ambulance-staff-auth.controller";
import Validator from "../validators/ambulance-staff.validator";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import StaffAuthMiddleware from "../middlewares/ambulance-staff-auth.middleware";
import { rateLimiters } from "../middlewares/rate-limit.middleware";

const router = Router();
const V = Validator();
const auth = StaffAuthMiddleware();

router.post(
  "/login",
  rateLimiters.otpSend,
  V.validateLoginPhone,
  ErrorHandlerMiddleware(C.login),
  ResponseMiddleware,
);

router.post(
  "/resend-otp",
  rateLimiters.otpSend,
  V.validateLoginPhone,
  ErrorHandlerMiddleware(C.resendOtp),
  ResponseMiddleware,
);

router.post(
  "/verify-otp",
  rateLimiters.otpVerify,
  V.validateVerifyOtp,
  ErrorHandlerMiddleware(C.verifyOtp),
  ResponseMiddleware,
);

router.post(
  "/logout",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.logout),
  ResponseMiddleware,
);

export default router;
