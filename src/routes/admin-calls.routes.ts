import { Router } from "express";
import * as C from "../controllers/admin/call.controller";
import AuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";

/** Call logs & click-to-call (MyOperator). Mounted at /admin/calls. */
const router = Router();
const auth = AuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.CALLS_VIEW),
  ErrorHandlerMiddleware(C.list),
  ResponseMiddleware,
);
router.get(
  "/stats",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.CALLS_VIEW),
  ErrorHandlerMiddleware(C.stats),
  ResponseMiddleware,
);
// Placing a call spends money and rings a real person, so it needs more than
// read access.
router.post(
  "/click-to-call",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.CALLS_PLACE),
  ErrorHandlerMiddleware(C.placeCall),
  ResponseMiddleware,
);
router.get(
  "/:id",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.CALLS_VIEW),
  ErrorHandlerMiddleware(C.detail),
  ResponseMiddleware,
);
router.put(
  "/:id/notes",
  auth.verifyAdminToken,
  auth.requirePermission(PERMISSIONS.CALLS_MANAGE),
  ErrorHandlerMiddleware(C.saveNotes),
  ResponseMiddleware,
);

export default router;
