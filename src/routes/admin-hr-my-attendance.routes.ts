import { Router } from "express";
import * as C from "../controllers/admin/my-attendance.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";

/**
 * An employee's own attendance. Mounted at /admin/hr/my-attendance.
 *
 * Deliberately NOT behind an attendance permission: this is a person's own
 * record, and gating it on ATTENDANCE_VIEW would mean only HR could punch —
 * which is the problem this exists to solve. The employee is resolved from the
 * signed-in token, so these routes can only ever reach the caller's own row.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get(
  "/",
  auth.verifyAdminToken,
  ErrorHandlerMiddleware(C.mine),
  ResponseMiddleware,
);

router.post(
  "/punch",
  auth.verifyAdminToken,
  upload.single("photo"),
  ErrorHandlerMiddleware(C.punch),
  ResponseMiddleware,
);

export default router;
