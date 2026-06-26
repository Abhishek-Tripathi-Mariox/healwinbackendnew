import { Router } from "express";
import * as C from "../controllers/admin/ipd.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Doctor Panel / HMS — IPD (beds + admissions). Mounted at /admin/ipd.
 */
const router = Router();
const auth = AdminAuthMiddleware();

// ---- Wards (bed-master picklist) ----
router.get(
  "/wards",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_VIEW),
  ErrorHandlerMiddleware(C.listWards),
  ResponseMiddleware,
);
router.post(
  "/wards",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_MANAGE),
  ErrorHandlerMiddleware(C.createWard),
  ResponseMiddleware,
);
router.put(
  "/wards/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_MANAGE),
  ErrorHandlerMiddleware(C.updateWard),
  ResponseMiddleware,
);
router.delete(
  "/wards/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_MANAGE),
  ErrorHandlerMiddleware(C.deleteWard),
  ResponseMiddleware,
);

// ---- Beds ----
router.get(
  "/beds",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_VIEW),
  ErrorHandlerMiddleware(C.listBeds),
  ResponseMiddleware,
);
router.post(
  "/beds",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_MANAGE),
  ErrorHandlerMiddleware(C.createBed),
  ResponseMiddleware,
);
router.put(
  "/beds/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.BEDS_MANAGE),
  ErrorHandlerMiddleware(C.updateBed),
  ResponseMiddleware,
);

// ---- Admissions ----
router.get(
  "/admissions",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IPD_VIEW),
  ErrorHandlerMiddleware(C.listAdmissions),
  ResponseMiddleware,
);
router.post(
  "/admissions",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IPD_MANAGE),
  ErrorHandlerMiddleware(C.admit),
  ResponseMiddleware,
);
router.get(
  "/admissions/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IPD_VIEW),
  ErrorHandlerMiddleware(C.detailAdmission),
  ResponseMiddleware,
);
router.post(
  "/admissions/:id/transfer",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IPD_MANAGE),
  ErrorHandlerMiddleware(C.transfer),
  ResponseMiddleware,
);
router.post(
  "/admissions/:id/discharge",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IPD_MANAGE),
  ErrorHandlerMiddleware(C.discharge),
  ResponseMiddleware,
);
router.post(
  "/admissions/:id/log",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.IPD_MANAGE),
  ErrorHandlerMiddleware(C.addLog),
  ResponseMiddleware,
);

export default router;
