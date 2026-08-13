import { Router } from "express";
import * as C from "../controllers/lab.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

/**
 * Public Lab Locator + onboarding submission. Mounted at /labs.
 */
const router = Router();

// Submit a lab listing request (public onboarding).
router.post(
  "/request",
  upload.single("image"),
  ErrorHandlerMiddleware(C.publicSubmit),
  ResponseMiddleware,
);

// Public locator (approved labs, with geo / state / district filters).
router.get(
  "/",
  cacheResponse(60),
  ErrorHandlerMiddleware(C.publicList),
  ResponseMiddleware,
);

export default router;
