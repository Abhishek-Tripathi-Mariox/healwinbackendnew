import { Router } from "express";
import * as LegalController from "../controllers/legal.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

// GET /legal/:type/:audience — public content fetch.
// 5-minute cache mirrors /about; admin upserts don't invalidate it
// directly (the apps poll on-screen open, so staleness is bounded).
router.get(
  "/:type/:audience",
  cacheResponse(300),
  ErrorHandlerMiddleware(LegalController.getPublicLegalDocument),
  ResponseMiddleware,
);

export default router;
