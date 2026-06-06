import { Router } from "express";
import * as C from "../controllers/ivr-escalation.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/**
 * Public IVR provider webhook (Exotel/Twilio call-status callbacks).
 * Mounted at /ivr.
 */
const router = Router();

router.post(
  "/callback",
  ErrorHandlerMiddleware(C.callback),
  ResponseMiddleware,
);
router.get(
  "/callback",
  ErrorHandlerMiddleware(C.callback),
  ResponseMiddleware,
);

export default router;
