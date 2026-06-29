import { Router } from "express";
import * as C from "../controllers/admin/first-aid.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** First-aid / emergency education content. Mounted at /admin/first-aid. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.CMS_VIEW);
const manage = auth.requirePermission(PERMISSIONS.CMS_UPDATE);

router.get("/", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.list), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.create), ResponseMiddleware);
router.put("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.update), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.remove), ResponseMiddleware);

export default router;
