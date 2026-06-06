import { Router } from "express";
import * as C from "../controllers/admin/ambulance-staff.controller";
import Validator from "../validators/ambulance-staff.validator";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();
const V = Validator();
const auth = AdminAuthMiddleware();

router.post(
  "/",
  auth.verifyAdminToken,
  V.validateCreate,
  ErrorHandlerMiddleware(C.create),
  ResponseMiddleware,
);

router.get(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);

router.get(
  "/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);

router.put(
  "/:id",
  auth.verifyAdminToken,
  V.validateUpdate,
  ErrorHandlerMiddleware(C.update),
  ResponseMiddleware,
);

router.post(
  "/:id/deactivate",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.deactivate),
  ResponseMiddleware,
);

router.delete(
  "/:id",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.softDelete),
  ResponseMiddleware,
);

export default router;
