import { Router } from "express";
import * as C from "../controllers/ambulance-dispatch-actions.controller";
import StaffAuthMiddleware from "../middlewares/ambulance-staff-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();
const auth = StaffAuthMiddleware();

router.post(
  "/:id/accept",
  auth.verifyStaffToken,
  auth.requireDriver,
  ErrorHandlerMiddleware(C.accept),
  ResponseMiddleware,
);

router.post(
  "/:id/reject",
  auth.verifyStaffToken,
  auth.requireDriver,
  ErrorHandlerMiddleware(C.reject),
  ResponseMiddleware,
);

router.post(
  "/:id/en-route",
  auth.verifyStaffToken,
  auth.requireDriver,
  ErrorHandlerMiddleware(C.enRoute),
  ResponseMiddleware,
);

router.post(
  "/:id/on-scene",
  auth.verifyStaffToken,
  auth.requireDriver,
  ErrorHandlerMiddleware(C.onScene),
  ResponseMiddleware,
);

router.post(
  "/:id/complete",
  auth.verifyStaffToken,
  auth.requireDriver,
  ErrorHandlerMiddleware(C.complete),
  ResponseMiddleware,
);

export default router;
