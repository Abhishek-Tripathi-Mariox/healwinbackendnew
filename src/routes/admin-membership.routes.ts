import { Router } from "express";
import * as C from "../controllers/admin/membership.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/** Admin CRUD for membership plans. Mounted at /admin/membership-plans. */
const router = Router();
const auth = AdminAuthMiddleware();

router.get("/", auth.verifyAdminToken, ErrorHandlerMiddleware(C.list), ResponseMiddleware);
router.post("/", auth.verifyAdminToken, ErrorHandlerMiddleware(C.create), ResponseMiddleware);
router.put("/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.update), ResponseMiddleware);
router.patch("/:id/toggle", auth.verifyAdminToken, ErrorHandlerMiddleware(C.toggle), ResponseMiddleware);
router.delete("/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.remove), ResponseMiddleware);

export default router;
