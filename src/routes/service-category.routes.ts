import { Router } from "express";
import * as ServiceCategoryController from "../controllers/service-category.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

router.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(ServiceCategoryController.listCategories),
  ResponseMiddleware,
);

router.get(
  "/:slug",
  cacheResponse(300),
  ErrorHandlerMiddleware(ServiceCategoryController.getCategoryBySlug),
  ResponseMiddleware,
);

export default router;
