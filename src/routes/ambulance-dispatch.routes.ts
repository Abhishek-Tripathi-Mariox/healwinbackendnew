import { Router } from "express";
import { body, param } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import * as C from "../controllers/admin/ambulance-dispatch.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();
const auth = AdminAuthMiddleware();

const run =
  (checks: any[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(checks.map((c) => c.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        rCode: 0,
        rMsg: "validation_failed",
        rData: { errors: errors.array() },
      });
    }
    next();
  };

router.get(
  "/sos/:sosId/nearby-ambulances",
  auth.verifyAdminToken,
  run([param("sosId").isMongoId()]),
  ErrorHandlerMiddleware(C.nearbyAmbulances),
  ResponseMiddleware,
);

router.get(
  "/sos/:sosId/search-ambulances",
  auth.verifyAdminToken,
  run([param("sosId").isMongoId()]),
  ErrorHandlerMiddleware(C.searchAmbulances),
  ResponseMiddleware,
);

router.post(
  "/sos/:sosId/dispatch",
  auth.verifyAdminToken,
  run([param("sosId").isMongoId(), body("ambulanceId").isMongoId()]),
  ErrorHandlerMiddleware(C.dispatch),
  ResponseMiddleware,
);

router.get(
  "/sos/:sosId/dispatch",
  auth.verifyAdminToken,
  run([param("sosId").isMongoId()]),
  ErrorHandlerMiddleware(C.getDispatchForSos),
  ResponseMiddleware,
);

router.post(
  "/sos/:sosId/dispatch/cancel",
  auth.verifyAdminToken,
  run([param("sosId").isMongoId()]),
  ErrorHandlerMiddleware(C.cancelDispatch),
  ResponseMiddleware,
);

router.get(
  "/ambulance-dispatches",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.listDispatches),
  ResponseMiddleware,
);

// Manually free a stuck ambulance (cancels its current dispatch + notifies).
router.post(
  "/ambulances/:ambulanceId/free",
  auth.verifyAdminToken,
  run([param("ambulanceId").isMongoId()]),
  ErrorHandlerMiddleware(C.freeAmbulance),
  ResponseMiddleware,
);

export default router;
