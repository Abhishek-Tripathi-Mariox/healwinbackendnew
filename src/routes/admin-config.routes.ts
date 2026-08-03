import { Router } from "express";
import * as C from "../controllers/admin/config.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Ambulance configuration — fare settings + vehicle types & pricing.
 * Mounted at /admin/config. The controller logic already existed; this
 * just exposes it (it was previously unrouted, so the admin had no way to
 * manage ambulance types or pricing).
 */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.AMBULANCE_CONFIG_VIEW);
const manage = auth.requirePermission(PERMISSIONS.AMBULANCE_CONFIG_MANAGE);

// ----- Fare configuration -----
router.get(
  "/fare-config",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.getFareConfig),
  ResponseMiddleware,
);
router.put(
  "/fare-config",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.updateFareConfig),
  ResponseMiddleware,
);

// ----- Vehicle types & pricing -----
router.get(
  "/vehicle-types",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.getVehicleTypes),
  ResponseMiddleware,
);
router.post(
  "/vehicle-types",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.createVehicleType),
  ResponseMiddleware,
);
router.put(
  "/vehicle-types/:id",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.updateVehicleType),
  ResponseMiddleware,
);
router.patch(
  "/vehicle-types/:id/toggle",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.toggleVehicleType),
  ResponseMiddleware,
);
router.delete(
  "/vehicle-types/:id",
  auth.verifyAdminToken,
  manage,
  ErrorHandlerMiddleware(C.deleteVehicleType),
  ResponseMiddleware,
);

export default router;
