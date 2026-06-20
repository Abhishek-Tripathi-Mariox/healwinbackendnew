import { Router } from "express";
import * as C from "../controllers/admin/patient-commerce.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";

/**
 * Admin inbox for patient-app commerce: doctor consultations, lab bookings,
 * pharmacy orders. Mounted at /admin/patient-commerce.
 */
const router = Router();
const auth = AdminAuthMiddleware();

router.get("/consultations", auth.verifyAdminToken, ErrorHandlerMiddleware(C.listConsultations), ResponseMiddleware);
router.patch("/consultations/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.updateConsultationStatus), ResponseMiddleware);
router.patch("/consultations/:id/reschedule", auth.verifyAdminToken, ErrorHandlerMiddleware(C.rescheduleConsultation), ResponseMiddleware);
router.patch("/consultations/:id/summary", auth.verifyAdminToken, ErrorHandlerMiddleware(C.setConsultationSummary), ResponseMiddleware);

router.get("/lab-bookings", auth.verifyAdminToken, ErrorHandlerMiddleware(C.listLabBookings), ResponseMiddleware);
router.patch("/lab-bookings/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.updateLabBookingStatus), ResponseMiddleware);
router.patch("/lab-bookings/:id/reschedule", auth.verifyAdminToken, ErrorHandlerMiddleware(C.rescheduleLabBooking), ResponseMiddleware);
router.post("/lab-bookings/:id/report", auth.verifyAdminToken, upload.array("file", 1), ErrorHandlerMiddleware(C.setLabReport), ResponseMiddleware);

router.get("/pharmacy-orders", auth.verifyAdminToken, ErrorHandlerMiddleware(C.listPharmacyOrders), ResponseMiddleware);
router.patch("/pharmacy-orders/:id", auth.verifyAdminToken, ErrorHandlerMiddleware(C.updatePharmacyOrderStatus), ResponseMiddleware);

export default router;
