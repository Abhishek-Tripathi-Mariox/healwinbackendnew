import { Router } from "express";
import * as C from "../controllers/admin/employee-shift.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HR — hospital/HR staff shift scheduling. Mounted at /admin/employee-shifts. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.EMPLOYEES_VIEW);
const manage = auth.requirePermission(PERMISSIONS.EMPLOYEES_UPDATE);

router.get("/", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.list), ResponseMiddleware);
router.get("/employees", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.employees), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.create), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.remove), ResponseMiddleware);

export default router;
