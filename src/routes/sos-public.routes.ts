import { Router } from "express";
import * as SOSPublicController from "../controllers/sos-public.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";

const router = Router();

/**
 * @route POST /v1/api/sos-public/call
 * @desc Record SOS call initiation (public - no auth)
 * @access Public
 */
router.post("/call", ErrorHandlerMiddleware(SOSPublicController.submitSOSCall));

/**
 * @route POST /v1/api/sos-public/form
 * @desc Submit SOS emergency form (public - no auth)
 * @access Public
 */
router.post("/form", ErrorHandlerMiddleware(SOSPublicController.submitSOSForm));

/**
 * @route POST /v1/api/sos-public/app-download
 * @desc Record app download interest (public - no auth)
 * @access Public
 */
router.post(
  "/app-download",
  ErrorHandlerMiddleware(SOSPublicController.recordAppDownload),
);

export default router;
