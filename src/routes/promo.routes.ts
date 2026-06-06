import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";

const { verifyUserToken } = AuthMiddleware();
import { rateLimiters } from "../middlewares/rate-limit.middleware";
import * as promoController from "../controllers/promo.controller";

const router = Router();

// Apply auth middleware
router.use(verifyUserToken);

// Validate promo code
router.post("/validate", rateLimiters.search, promoController.validatePromo);

// Get available promos for user
router.get("/available", promoController.getAvailablePromos);

// Get promo details
router.get("/:code", promoController.getPromoDetails);

export default router;
