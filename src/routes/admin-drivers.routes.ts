import { Router } from "express";
import * as C from "../controllers/admin/driver.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Ride drivers (the Driver collection behind the driver app), mounted at
 * /admin/drivers. Distinct from /admin/ambulance-staff, which is ambulance
 * crew. Since driver login is invite-only, POST / is the only way a driver
 * account comes into existence.
 *
 * Static sub-paths are declared before /:id so they aren't swallowed by it.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_VIEW),
  ErrorHandlerMiddleware(C.getAllDrivers),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_CREATE),
  ErrorHandlerMiddleware(C.createDriver),
  ResponseMiddleware,
);

router.get(
  "/stats",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_VIEW),
  ErrorHandlerMiddleware(C.getDriverStats),
  ResponseMiddleware,
);

router.get(
  "/pending-verifications",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_VERIFY),
  ErrorHandlerMiddleware(C.getPendingVerifications),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_VIEW),
  ErrorHandlerMiddleware(C.getDriverById),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_UPDATE),
  ErrorHandlerMiddleware(C.updateDriver),
  ResponseMiddleware,
);

router.post(
  "/:id/verify",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_VERIFY),
  ErrorHandlerMiddleware(C.verifyDriver),
  ResponseMiddleware,
);

// Suspending/reinstating is what actually locks a driver out at login, so it
// sits behind drivers:block rather than the generic update permission.
router.put(
  "/:id/status",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_BLOCK),
  ErrorHandlerMiddleware(C.updateDriverStatus),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_DELETE),
  ErrorHandlerMiddleware(C.deleteDriver),
  ResponseMiddleware,
);

router.post(
  "/:id/restore",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.DRIVERS_DELETE),
  ErrorHandlerMiddleware(C.restoreDriver),
  ResponseMiddleware,
);

export default router;
