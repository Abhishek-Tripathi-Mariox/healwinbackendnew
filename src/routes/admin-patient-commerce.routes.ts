import { Router } from "express";
import * as C from "../controllers/admin/patient-commerce.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { PERMISSIONS } from "../models/role.model";

/**
 * Admin inbox for patient-app commerce: doctor consultations, lab bookings,
 * pharmacy orders. Mounted at /admin/patient-commerce.
 */
const router = Router();
const auth = AdminAuthMiddleware();
const view = auth.requirePermission(PERMISSIONS.PATIENT_COMMERCE_VIEW);
const manage = auth.requirePermission(PERMISSIONS.PATIENT_COMMERCE_MANAGE);

router.get("/consultations", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listConsultations), ResponseMiddleware);
router.patch("/consultations/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updateConsultationStatus), ResponseMiddleware);
router.patch("/consultations/:id/reschedule", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.rescheduleConsultation), ResponseMiddleware);
router.patch("/consultations/:id/summary", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.setConsultationSummary), ResponseMiddleware);

router.get("/lab-bookings", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listLabBookings), ResponseMiddleware);
router.patch("/lab-bookings/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updateLabBookingStatus), ResponseMiddleware);
router.patch("/lab-bookings/:id/reschedule", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.rescheduleLabBooking), ResponseMiddleware);
router.post("/lab-bookings/:id/report", auth.verifyAdminToken, manage, upload.array("file", 20), ErrorHandlerMiddleware(C.setLabReport), ResponseMiddleware);

router.get("/pharmacy-orders", auth.verifyAdminToken, view, ErrorHandlerMiddleware(C.listPharmacyOrders), ResponseMiddleware);
router.patch("/pharmacy-orders/:id", auth.verifyAdminToken, manage, ErrorHandlerMiddleware(C.updatePharmacyOrderStatus), ResponseMiddleware);

export default router;
