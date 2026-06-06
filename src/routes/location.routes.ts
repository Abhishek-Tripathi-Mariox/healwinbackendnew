import { Router } from "express";
import * as LocationController from "../controllers/location.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();

// List active states
router.get(
  "/states",
  ErrorHandlerMiddleware(LocationController.listStates),
  ResponseMiddleware,
);

// List all districts (optional ?state= filter)
router.get(
  "/districts",
  ErrorHandlerMiddleware(LocationController.listDistricts),
  ResponseMiddleware,
);

// List districts by state
router.get(
  "/states/:stateId/districts",
  ErrorHandlerMiddleware(LocationController.listDistrictsByState),
  ResponseMiddleware,
);

// List divisions by district
router.get(
  "/districts/:districtId/divisions",
  ErrorHandlerMiddleware(LocationController.listDivisionsByDistrict),
  ResponseMiddleware,
);

export default router;
