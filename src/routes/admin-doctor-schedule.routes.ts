import { Router } from "express";
import * as C from "../controllers/admin/doctor-schedule.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Doctor Panel / HMS — per-doctor OPD availability. Mounted at /admin/doctor-schedules. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.OPD_VIEW),
  ErrorHandlerMiddleware(C.listDoctors),
  ResponseMiddleware,
);
router.get(
  "/:doctorId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.OPD_VIEW),
  ErrorHandlerMiddleware(C.getSchedule),
  ResponseMiddleware,
);
router.put(
  "/:doctorId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.OPD_MANAGE),
  ErrorHandlerMiddleware(C.saveSchedule),
  ResponseMiddleware,
);

export default router;
