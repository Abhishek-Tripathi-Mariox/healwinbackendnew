import { Router } from "express";
import * as C from "../controllers/admin/ot.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HMS Operation Theatre — theatres + surgery scheduling. Mounted at /admin/ot. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.IPD_VIEW);
const manage = auth.requirePermission(PERMISSIONS.IPD_MANAGE);

router.get("/theatres", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listTheatres), ResponseMiddleware);
router.post("/theatres", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createTheatre), ResponseMiddleware);
router.put("/theatres/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updateTheatre), ResponseMiddleware);
router.delete("/theatres/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.deleteTheatre), ResponseMiddleware);

router.get("/surgeries", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listSurgeries), ResponseMiddleware);
router.post("/surgeries", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createSurgery), ResponseMiddleware);
router.post("/surgeries/:id/status", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updateSurgeryStatus), ResponseMiddleware);

export default router;
