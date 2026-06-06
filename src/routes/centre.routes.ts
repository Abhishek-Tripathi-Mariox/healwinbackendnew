import { Router } from "express";
import * as CentreController from "../controllers/centre.controller";
import * as CentreRequestController from "../controllers/centre-request.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const router = Router();

// List locator service types (for tabs)
router.get(
  "/service-types",
  cacheResponse(300),
  ErrorHandlerMiddleware(CentreController.listServiceTypes),
  ResponseMiddleware,
);

// List departments
router.get(
  "/departments",
  cacheResponse(300),
  ErrorHandlerMiddleware(CentreController.listDepartments),
  ResponseMiddleware,
);

// Submit a centre listing request (public)
router.post(
  "/request",
  upload.single("image"),
  ErrorHandlerMiddleware(CentreRequestController.submitCentreRequest),
  ResponseMiddleware,
);

// Search centres with filters
router.get(
  "/",
  cacheResponse(60),
  ErrorHandlerMiddleware(CentreController.searchCentres),
  ResponseMiddleware,
);

// Get single centre
router.get(
  "/:id",
  cacheResponse(300),
  ErrorHandlerMiddleware(CentreController.getCentreByIdPublic),
  ResponseMiddleware,
);

export default router;
