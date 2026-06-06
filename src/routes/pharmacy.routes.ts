import { Router } from "express";
import * as C from "../controllers/pharmacy.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

/**
 * Public Pharmacy Locator + onboarding submission. Mounted at /pharmacies.
 */
const router = Router();

// Submit a pharmacy listing request (public onboarding).
router.post(
  "/request",
  upload.single("image"),
  ErrorHandlerMiddleware(C.publicSubmit),
  ResponseMiddleware,
);

// Public locator (approved pharmacies, with geo / state / district filters).
router.get(
  "/",
  cacheResponse(60),
  ErrorHandlerMiddleware(C.publicList),
  ResponseMiddleware,
);

export default router;
