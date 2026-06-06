import { Router } from "express";
import * as C from "../controllers/admin/hospital.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.listHospitals),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.hospitalDetail),
  ResponseMiddleware,
);

router.get(
  "/:id/staff",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.listHospitalStaff),
  ResponseMiddleware,
);

router.post(
  "/:id/staff",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.createHospitalStaff),
  ResponseMiddleware,
);

router.post(
  "/:id/staff/assign",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.assignStaffToHospital),
  ResponseMiddleware,
);

router.delete(
  "/:id/staff/:staffId",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.removeStaffFromHospital),
  ResponseMiddleware,
);

export default router;
