import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import * as WalletController from "../controllers/wallet.controller";

const router = Router();

router.post(
  "/add",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(WalletController.addToWallet),
  ResponseMiddleware
);

router.get(
  "/",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(WalletController.getWallet),
  ResponseMiddleware
);

export default router;
