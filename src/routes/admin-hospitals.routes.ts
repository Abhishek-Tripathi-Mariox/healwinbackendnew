import { Router } from "express";
import * as C from "../controllers/admin/hospital.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.STAFF_VIEW);

router.get(
  "/",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.listHospitals),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.hospitalDetail),
  ResponseMiddleware,
);

router.get(
  "/:id/staff",
  auth.verifyAdminToken,
  view,
  ErrorHandlerMiddleware(C.listHospitalStaff),
  ResponseMiddleware,
);

router.post(
  "/:id/staff",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.STAFF_CREATE),
  ErrorHandlerMiddleware(C.createHospitalStaff),
  ResponseMiddleware,
);

router.post(
  "/:id/staff/assign",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.STAFF_UPDATE),
  ErrorHandlerMiddleware(C.assignStaffToHospital),
  ResponseMiddleware,
);

router.delete(
  "/:id/staff/:staffId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.STAFF_DELETE),
  ErrorHandlerMiddleware(C.removeStaffFromHospital),
  ResponseMiddleware,
);

export default router;
