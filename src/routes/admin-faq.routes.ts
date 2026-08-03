import { Router } from "express";
import * as C from "../controllers/admin/faq.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Admin CRUD for Help & Support FAQs. Mounted at /admin/faqs. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.FAQ_VIEW);
const manage = auth.requirePermission(PERMISSIONS.FAQ_MANAGE);

router.get("/", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.list), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.create), ResponseMiddleware);
router.patch("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.update), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.remove), ResponseMiddleware);

export default router;
