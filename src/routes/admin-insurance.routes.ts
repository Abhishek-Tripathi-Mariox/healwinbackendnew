import { Router } from "express";
import * as C from "../controllers/admin/insurance.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HMS Insurance / TPA / Claims. Mounted at /admin/insurance. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.BILLING_VIEW);
const manage = auth.requirePermission(PERMISSIONS.BILLING_UPDATE);

// Payers
router.get("/payers", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listPayers), ResponseMiddleware);
router.post("/payers", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createPayer), ResponseMiddleware);
router.put("/payers/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updatePayer), ResponseMiddleware);
router.delete("/payers/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.deletePayer), ResponseMiddleware);

// Policies
router.get("/policies", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listPolicies), ResponseMiddleware);
router.post("/policies", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createPolicy), ResponseMiddleware);
router.put("/policies/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updatePolicy), ResponseMiddleware);

// Claims
router.get("/claims", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listClaims), ResponseMiddleware);
router.post("/claims", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createClaim), ResponseMiddleware);
router.post("/claims/:id/status", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updateClaimStatus), ResponseMiddleware);

export default router;
