import { Router } from "express";
import * as CmsController from "../controllers/cms.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

// List all CMS pages (slugs + titles)
router.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(CmsController.listCmsPages),
  ResponseMiddleware,
);

// Get CMS page by slug
router.get(
  "/:slug",
  cacheResponse(300),
  ErrorHandlerMiddleware(CmsController.getCmsPageBySlug),
  ResponseMiddleware,
);

export default router;
