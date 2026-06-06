import { Router } from "express";
import * as ServiceController from "../controllers/service.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

router.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(ServiceController.listServices),
  ResponseMiddleware,
);

router.get(
  "/nearby",
  ErrorHandlerMiddleware(ServiceController.getNearbyServices),
  ResponseMiddleware,
);

router.get(
  "/:slug",
  cacheResponse(300),
  ErrorHandlerMiddleware(ServiceController.getServiceBySlug),
  ResponseMiddleware,
);

export default router;
