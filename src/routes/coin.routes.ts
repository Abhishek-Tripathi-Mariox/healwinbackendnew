import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";

const { verifyUserToken } = AuthMiddleware();
import * as coinController from "../controllers/coin.controller";

const router = Router();

// Apply auth middleware
router.use(verifyUserToken);

// Get coin wallet balance
router.get("/balance", coinController.getCoinBalance);

// Get coin transaction history
router.get("/transactions", coinController.getCoinTransactions);

// Transfer coins to wallet
router.post("/transfer-to-wallet", coinController.transferToWallet);

// Request bank transfer
router.post("/bank-transfer", coinController.requestBankTransfer);

// Get coin rewards history (earned coins)
router.get("/rewards", coinController.getRewardsHistory);

// Get coin redemption history (used coins)
router.get("/redemptions", coinController.getRedemptionHistory);

export default router;
