import { Router } from "express";

import * as AuthController from "../controllers/auth.controller";
import AuthValidator from "../validators/auth.validator";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import AuthMiddleware from "../middlewares/auth.middleware";
import { rateLimiters } from "../middlewares/rate-limit.middleware";

const authRouter = Router();

/**
 * Login
 */
authRouter.post(
  "/login",
  rateLimiters.otpSend,
  AuthValidator().validateLogin,
  ErrorHandlerMiddleware(AuthController.login),
  ResponseMiddleware
);

/**
 * Verify OTP
 */
authRouter.post(
  "/verifyOtp",
  rateLimiters.otpVerify,
  AuthValidator().validateOtp,
  ErrorHandlerMiddleware(AuthController.verifyOtp),
  ResponseMiddleware
);

/**
 * Resend OTP
 */
authRouter.put(
  "/resendOtp",
  rateLimiters.otpSend,
  AuthValidator().validateLogin,
  ErrorHandlerMiddleware(AuthController.resendOtp),
  ResponseMiddleware
);

/**
 * Logout
 */
// authRouter.get(
//   "/logout",
//   AuthMiddleware().verifyUserToken,
//   ErrorHandlerMiddleware(AuthController.logout),
//   ResponseMiddleware
// );

export default authRouter;
