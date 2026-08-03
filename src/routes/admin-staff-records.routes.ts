import { Router } from "express";
import * as C from "../controllers/admin/ambulance-staff-records.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Admin views for ambulance-staff app records (patients, case notes, stock
 * requests, leaves). Mounted at /admin/staff-records to avoid colliding with
 * the /admin/ambulance-staff/:id routes.
 */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.STAFF_VIEW);
const update = auth.requirePermission(PERMISSIONS.STAFF_UPDATE);

router.get("/patients", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listStaffPatients), ResponseMiddleware);

router.get("/case-notes", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listCaseNotes), ResponseMiddleware);

router.get("/stock-requests", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listStockRequests), ResponseMiddleware);
router.patch("/stock-requests/:id", auth.verifyAdminToken, update, ErrorHandlerMiddleware(C.updateStockRequestStatus), ResponseMiddleware);

router.get("/leaves", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listLeaves), ResponseMiddleware);
router.patch("/leaves/:id", auth.verifyAdminToken, update, ErrorHandlerMiddleware(C.updateLeaveStatus), ResponseMiddleware);

export default router;
