import { Router } from "express";
import * as C from "../controllers/admin/procurement.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** HMS Procurement — suppliers + purchase orders. Mounted at /admin/procurement. */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.INVENTORY_VIEW);
const manage = auth.requirePermission(PERMISSIONS.INVENTORY_UPDATE);

router.get("/suppliers", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listSuppliers), ResponseMiddleware);
router.post("/suppliers", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createSupplier), ResponseMiddleware);
router.put("/suppliers/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updateSupplier), ResponseMiddleware);
router.delete("/suppliers/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.deleteSupplier), ResponseMiddleware);

router.get("/purchase-orders", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listPurchaseOrders), ResponseMiddleware);
router.post("/purchase-orders", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.createPurchaseOrder), ResponseMiddleware);
router.post("/purchase-orders/:id/status", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updatePurchaseOrderStatus), ResponseMiddleware);

export default router;
