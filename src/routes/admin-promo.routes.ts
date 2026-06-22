import { Router } from "express";
import * as C from "../controllers/admin/promo.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/** Admin CRUD for promo codes (logistics + ambulance). Mounted at /admin/promos. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get("/", auth.verifyAdminToken, ErrorHandlerMiddleware(C.getAllPromos), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, ErrorHandlerMiddleware(C.createPromo), ResponseMiddleware);
router.get("/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.getPromoById), ResponseMiddleware);
router.put("/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.updatePromo), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.deletePromo), ResponseMiddleware);
router.get("/:id/stats", auth.verifyAdminToken, ErrorHandlerMiddleware(C.getPromoStats), ResponseMiddleware);
router.patch("/:id/toggle", auth.verifyAdminToken, ErrorHandlerMiddleware(C.togglePromoStatus), ResponseMiddleware);

export default router;
