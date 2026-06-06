import { Router } from "express";
import * as SOSController from "../controllers/sos.controller";
import AuthMiddleware from "../middlewares/auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";

const router = Router();
const { verifyUserToken } = AuthMiddleware();

// ===== Emergency Contacts =====

/**
 * @route GET /v1/api/sos/contacts
 * @desc Get emergency contacts
 * @access Private
 */
router.get(
  "/contacts",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.getEmergencyContacts),
);

/**
 * @route POST /v1/api/sos/contacts
 * @desc Add emergency contact
 * @access Private
 */
router.post(
  "/contacts",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.addEmergencyContact),
);

/**
 * @route PUT /v1/api/sos/contacts/:contactId
 * @desc Update emergency contact
 * @access Private
 */
router.put(
  "/contacts/:contactId",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.updateEmergencyContact),
);

/**
 * @route DELETE /v1/api/sos/contacts/:contactId
 * @desc Delete emergency contact
 * @access Private
 */
router.delete(
  "/contacts/:contactId",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.deleteEmergencyContact),
);

// ===== SOS Alerts =====

/**
 * @route POST /v1/api/sos/trigger
 * @desc Trigger SOS alert
 * @access Private
 */
router.post(
  "/trigger",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.triggerSOS),
);

/**
 * @route PUT /v1/api/sos/:sosId/cancel
 * @desc Cancel SOS alert
 * @access Private
 */
router.put(
  "/:sosId/cancel",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.cancelSOS),
);

/**
 * @route GET /v1/api/sos/history
 * @desc Get SOS history
 * @access Private
 */
router.get(
  "/history",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.getSOSHistory),
);

/**
 * @route POST /v1/api/sos/share-location
 * @desc Share live location with emergency contacts
 * @access Private
 */
router.post(
  "/share-location",
  verifyUserToken,
  ErrorHandlerMiddleware(SOSController.shareLiveLocation),
);

export default router;
