import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import * as WalletController from "../controllers/wallet.controller";

const router = Router();

// Top-up is a TWO-step, gateway-verified flow. The old single-shot "/add",
// which credited any amount the client named with no payment, is gone.
router.post(
  "/topup/start",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(WalletController.startWalletTopUp),
  ResponseMiddleware
);
router.post(
  "/topup/confirm",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(WalletController.confirmWalletTopUp),
  ResponseMiddleware
);

router.get(
  "/",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(WalletController.getWallet),
  ResponseMiddleware
);

export default router;
