import { Router } from "express";
import * as C from "../controllers/admin/catalog.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Admin CRUD for the patient-app catalog. Mounted at /admin/catalog with
 * /doctors, /products and /lab-tests sub-resources.
 */
const router = Router();
const auth = AdminAuthMiddleware();

const view = auth.requirePermission(PERMISSIONS.CATALOG_VIEW);
const manage = auth.requirePermission(PERMISSIONS.CATALOG_MANAGE);

const resource = (
  base: string,
  handlers: { list: any; create: any; update: any; remove: any },
) => {
  router.get(base, auth.verifyAdminToken, view, ErrorHandlerMiddleware(handlers.list), ResponseMiddleware);
  router.post(base, auth.verifyAdminToken, manage, ErrorHandlerMiddleware(handlers.create), ResponseMiddleware);
  router.put(`${base}/:id`, auth.verifyAdminToken, manage, ErrorHandlerMiddleware(handlers.update), ResponseMiddleware);
  router.delete(`${base}/:id`, auth.verifyAdminToken, manage, ErrorHandlerMiddleware(handlers.remove), ResponseMiddleware);
};

resource("/products", C.products);
resource("/lab-tests", C.tests);

export default router;
