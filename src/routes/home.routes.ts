import { Router } from "express";
import * as HomeController from "../controllers/home.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

// GET /home-content — Public homepage content with services
router.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(HomeController.getHomeContent),
  ResponseMiddleware,
);

// POST /home-content/visitor/register — Register a new visit and get visitor number
router.post("/visitor/register", HomeController.registerVisit);

// GET /home-content/visitor/count — Get total visitor count
router.get("/visitor/count", HomeController.getVisitorCount);

export default router;
