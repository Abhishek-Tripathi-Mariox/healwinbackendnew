import { Router } from "express";
import * as C from "../controllers/admin/ambulance-staff-records.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

/**
 * Admin views for ambulance-staff app records (patients, case notes, stock
 * requests, leaves). Mounted at /admin/staff-records to avoid colliding with
 * the /admin/ambulance-staff/:id routes.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get("/case-notes", auth.verifyAdminToken, ErrorHandlerMiddleware(C.listCaseNotes), ResponseMiddleware);

router.get("/stock-requests", auth.verifyAdminToken, ErrorHandlerMiddleware(C.listStockRequests), ResponseMiddleware);
router.patch("/stock-requests/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.updateStockRequestStatus), ResponseMiddleware);

router.get("/leaves", auth.verifyAdminToken, ErrorHandlerMiddleware(C.listLeaves), ResponseMiddleware);
router.patch("/leaves/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.updateLeaveStatus), ResponseMiddleware);

export default router;
