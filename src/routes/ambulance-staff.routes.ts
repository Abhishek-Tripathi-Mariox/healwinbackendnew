import { Router } from "express";
import * as C from "../controllers/ambulance-staff.controller";
import * as X from "../controllers/ambulance-staff-extras.controller";
import * as R from "../controllers/ambulance-staff-request.controller";
import Validator from "../validators/ambulance-staff.validator";
import StaffAuthMiddleware from "../middlewares/ambulance-staff-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";

const router = Router();
const V = Validator();
const auth = StaffAuthMiddleware();

router.get(
  "/me",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.me),
  ResponseMiddleware,
);

router.post(
  "/duty",
  auth.verifyStaffToken,
  V.validateDuty,
  ErrorHandlerMiddleware(C.setDuty),
  ResponseMiddleware,
);

router.post(
  "/location",
  auth.verifyStaffToken,
  V.validateLocation,
  ErrorHandlerMiddleware(C.updateLocation),
  ResponseMiddleware,
);

router.put(
  "/profile",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.updateProfile),
  ResponseMiddleware,
);

router.post(
  "/profile-photo",
  auth.verifyStaffToken,
  upload.array("profilePhoto", 1),
  ErrorHandlerMiddleware(C.updateProfilePhoto),
  ResponseMiddleware,
);

router.get(
  "/off-duty-reasons",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.listOffDutyReasons),
  ResponseMiddleware,
);

router.post(
  "/fcm-token",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.updateFcmToken),
  ResponseMiddleware,
);

router.get(
  "/dispatches/active",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.activeDispatch),
  ResponseMiddleware,
);

router.get(
  "/dispatches/history",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.dispatchHistory),
  ResponseMiddleware,
);

router.get(
  "/shifts",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.myShifts),
  ResponseMiddleware,
);

router.post(
  "/shifts/:id/clock-in",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.clockIn),
  ResponseMiddleware,
);

router.post(
  "/shifts/:id/clock-out",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.clockOut),
  ResponseMiddleware,
);

router.get(
  "/notifications",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.listNotifications),
  ResponseMiddleware,
);

router.post(
  "/notifications/:id/read",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.markNotificationRead),
  ResponseMiddleware,
);

router.post(
  "/notifications/read-all",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.markAllNotificationsRead),
  ResponseMiddleware,
);

router.get(
  "/earnings",
  auth.verifyStaffToken,
  ErrorHandlerMiddleware(C.earnings),
  ResponseMiddleware,
);

// ===== Leave / Patients / Case-notes / Stock (staff app) =====
router.get("/leaves", auth.verifyStaffToken, ErrorHandlerMiddleware(X.listLeaves), ResponseMiddleware);
router.post("/leaves", auth.verifyStaffToken, upload.array("attachment", 1), ErrorHandlerMiddleware(X.applyLeave), ResponseMiddleware);
router.get("/patients", auth.verifyStaffToken, ErrorHandlerMiddleware(X.listPatients), ResponseMiddleware);
router.post("/patients", auth.verifyStaffToken, ErrorHandlerMiddleware(X.addPatient), ResponseMiddleware);
router.post("/case-notes", auth.verifyStaffToken, ErrorHandlerMiddleware(X.saveCaseNote), ResponseMiddleware);
router.post("/stock-requests", auth.verifyStaffToken, ErrorHandlerMiddleware(X.createStockRequest), ResponseMiddleware);

// ===== Patient AmbulanceRequest dispatch actions (SOS / Book-Ambulance loop) =====
router.get("/requests/active", auth.verifyStaffToken, ErrorHandlerMiddleware(R.activeRequest), ResponseMiddleware);
router.post("/requests/:id/accept", auth.verifyStaffToken, ErrorHandlerMiddleware(R.accept), ResponseMiddleware);
router.post("/requests/:id/reject", auth.verifyStaffToken, ErrorHandlerMiddleware(R.reject), ResponseMiddleware);
router.post("/requests/:id/en-route", auth.verifyStaffToken, ErrorHandlerMiddleware(R.enRoute), ResponseMiddleware);
router.post("/requests/:id/arrived", auth.verifyStaffToken, ErrorHandlerMiddleware(R.arrived), ResponseMiddleware);
router.post("/requests/:id/start", auth.verifyStaffToken, ErrorHandlerMiddleware(R.startTrip), ResponseMiddleware);
router.post("/requests/:id/complete", auth.verifyStaffToken, ErrorHandlerMiddleware(R.complete), ResponseMiddleware);
router.post("/requests/:id/destination", auth.verifyStaffToken, ErrorHandlerMiddleware(R.setDestination), ResponseMiddleware);

export default router;
