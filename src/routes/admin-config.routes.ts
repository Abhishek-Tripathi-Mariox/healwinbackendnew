import { Router } from "express";
import * as C from "../controllers/admin/config.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/**
 * Ambulance configuration — fare settings + vehicle types & pricing.
 * Mounted at /admin/config. The controller logic already existed; this
 * just exposes it (it was previously unrouted, so the admin had no way to
 * manage ambulance types or pricing).
 */
const router = Router();
const auth = AdminAuthMiddleware();

// ----- Fare configuration -----
router.get(
  "/fare-config",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getFareConfig),
  ResponseMiddleware,
);
router.put(
  "/fare-config",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.updateFareConfig),
  ResponseMiddleware,
);

// ----- Vehicle types & pricing -----
router.get(
  "/vehicle-types",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.getVehicleTypes),
  ResponseMiddleware,
);
router.post(
  "/vehicle-types",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.createVehicleType),
  ResponseMiddleware,
);
router.put(
  "/vehicle-types/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.updateVehicleType),
  ResponseMiddleware,
);
router.patch(
  "/vehicle-types/:id/toggle",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.toggleVehicleType),
  ResponseMiddleware,
);
router.delete(
  "/vehicle-types/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.deleteVehicleType),
  ResponseMiddleware,
);

export default router;
