import { Router } from "express";
import * as AboutController from "../controllers/about.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

// GET /about - Get public about page content with real stats
router.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(AboutController.getAboutContent),
  ResponseMiddleware,
);

export default router;
