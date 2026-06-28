import { Router } from "express";
import * as C from "../controllers/admin/doctor-roster.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HMS — doctor duty roster / on-call. Mounted at /admin/doctor-roster. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get("/", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.OPD_VIEW), ErrorHandlerMiddleware(C.list), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.OPD_MANAGE), ErrorHandlerMiddleware(C.create), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.OPD_MANAGE), ErrorHandlerMiddleware(C.remove), ResponseMiddleware);

export default router;
