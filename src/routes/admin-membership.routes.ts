import { Router } from "express";
import * as C from "../controllers/admin/membership.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Admin CRUD for membership plans. Mounted at /admin/membership-plans. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.MEMBERSHIP_PLANS_VIEW);
const manage = auth.requirePermission(PERMISSIONS.MEMBERSHIP_PLANS_MANAGE);

router.get("/", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.list), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.create), ResponseMiddleware);
router.put("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.update), ResponseMiddleware);
router.patch("/:id/toggle", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.toggle), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.remove), ResponseMiddleware);

export default router;
