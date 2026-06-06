import { Router } from "express";
import * as EnterpriseController from "../controllers/enterprise.controller";
import AuthMiddleware from "../middlewares/auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";

const router = Router();
const { verifyUserToken } = AuthMiddleware();

/**
 * @route POST /v1/api/enterprise/request
 * @desc Request enterprise account
 * @access Private
 */
router.post(
  "/request",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.requestEnterpriseAccount),
);

/**
 * @route GET /v1/api/enterprise/me
 * @desc Get user's enterprise
 * @access Private
 */
router.get(
  "/me",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.getMyEnterprise),
);

/**
 * @route PUT /v1/api/enterprise/:enterpriseId
 * @desc Update enterprise details
 * @access Private (Admin only)
 */
router.put(
  "/:enterpriseId",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.updateEnterprise),
);

/**
 * @route GET /v1/api/enterprise/dashboard
 * @desc Get enterprise dashboard
 * @access Private
 */
router.get(
  "/dashboard",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.getEnterpriseDashboard),
);

/**
 * @route GET /v1/api/enterprise/users
 * @desc Get enterprise users
 * @access Private (Admin/Manager)
 */
router.get(
  "/users",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.getEnterpriseUsers),
);

/**
 * @route POST /v1/api/enterprise/users
 * @desc Add user to enterprise
 * @access Private (Admin/Manager)
 */
router.post(
  "/users",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.addEnterpriseUser),
);

/**
 * @route DELETE /v1/api/enterprise/users/:userId
 * @desc Remove user from enterprise
 * @access Private (Admin only)
 */
router.delete(
  "/users/:userId",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.removeEnterpriseUser),
);

/**
 * @route GET /v1/api/enterprise/bookings
 * @desc Get enterprise bookings
 * @access Private
 */
router.get(
  "/bookings",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.getEnterpriseBookings),
);

/**
 * @route POST /v1/api/enterprise/bookings/credit
 * @desc Create booking using enterprise credit
 * @access Private
 */
router.post(
  "/bookings/credit",
  verifyUserToken,
  ErrorHandlerMiddleware(EnterpriseController.createCreditBooking),
);

export default router;
