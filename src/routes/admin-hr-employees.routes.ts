import { Router } from "express";
import * as C from "../controllers/admin/hr-employee.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";
import upload from "../middlewares/upload.middleware";

/** HR — Employees. Mounted at /admin/hr/employees. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.post(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_CREATE),
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.put(
  "/:id/salary-structure",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.SALARY_STRUCTURE_MANAGE),
  ErrorHandlerMiddleware(C.updateSalaryStructure),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_DELETE),
  ErrorHandlerMiddleware(C.remove),
  ResponseMiddleware,
);

// Pick-lists for the employee form (categories).
router.get(
  "/meta/options",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  ErrorHandlerMiddleware(C.meta),
  ResponseMiddleware,
);

// ---- Employee documents (§2) ----
router.post(
  "/:id/documents",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  upload.single("file"),
  ErrorHandlerMiddleware(C.addDocument),
  ResponseMiddleware,
);
router.delete(
  "/:id/documents/:docId",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.EMPLOYEES_UPDATE),
  ErrorHandlerMiddleware(C.removeDocument),
  ResponseMiddleware,
);

export default router;
