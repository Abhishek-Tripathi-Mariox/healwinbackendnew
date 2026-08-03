import { Router } from "express";
import * as C from "../controllers/admin/promo.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Admin CRUD for promo codes (logistics + ambulance). Mounted at /admin/promos. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.PROMOS_VIEW);

router.get("/", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.getAllPromos), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.PROMOS_CREATE), ErrorHandlerMiddleware(C.createPromo), ResponseMiddleware);
router.get("/:id", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.getPromoById), ResponseMiddleware);
router.put("/:id", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.PROMOS_UPDATE), ErrorHandlerMiddleware(C.updatePromo), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.PROMOS_DELETE), ErrorHandlerMiddleware(C.deletePromo), ResponseMiddleware);
router.get("/:id/stats", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.getPromoStats), ResponseMiddleware);
router.patch("/:id/toggle", auth.verifyAdminToken, auth.requirePermission(PERMISSIONS.PROMOS_UPDATE), ErrorHandlerMiddleware(C.togglePromoStatus), ResponseMiddleware);

export default router;
