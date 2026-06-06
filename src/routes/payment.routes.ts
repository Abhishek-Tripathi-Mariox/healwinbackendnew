import { Router } from "express";
import * as PaymentController from "../controllers/payment.controller";
import AuthMiddleware from "../middlewares/auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";

const router = Router();
const { verifyUserToken } = AuthMiddleware();

/**
 * @route GET /v1/api/payments/methods
 * @desc Get available payment methods
 * @access Private
 */
router.get(
  "/methods",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.getPaymentMethods),
);

/**
 * @route POST /v1/api/payments/booking/:bookingId/order
 * @desc Create payment order for booking
 * @access Private
 */
router.post(
  "/booking/:bookingId/order",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.createBookingPaymentOrder),
);

/**
 * @route POST /v1/api/payments/booking/:bookingId/verify
 * @desc Verify booking payment
 * @access Private
 */
router.post(
  "/booking/:bookingId/verify",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.verifyBookingPayment),
);

/**
 * @route POST /v1/api/payments/booking/:bookingId/wallet
 * @desc Pay booking using wallet
 * @access Private
 */
router.post(
  "/booking/:bookingId/wallet",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.payUsingWallet),
);

/**
 * @route POST /v1/api/payments/wallet/recharge
 * @desc Create wallet recharge order
 * @access Private
 */
router.post(
  "/wallet/recharge",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.createWalletRechargeOrder),
);

/**
 * @route POST /v1/api/payments/wallet/verify
 * @desc Verify wallet recharge
 * @access Private
 */
router.post(
  "/wallet/verify",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.verifyWalletRecharge),
);

/**
 * @route GET /v1/api/payments/transactions
 * @desc Get transaction history
 * @access Private
 */
router.get(
  "/transactions",
  verifyUserToken,
  ErrorHandlerMiddleware(PaymentController.getTransactionHistory),
);

/**
 * @route POST /v1/api/payments/webhook
 * @desc Razorpay webhook handler
 * @access Public (verified by signature)
 */
router.post(
  "/webhook",
  ErrorHandlerMiddleware(PaymentController.handleWebhook),
);

export default router;
