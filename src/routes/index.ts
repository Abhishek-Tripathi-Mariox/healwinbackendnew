import { Router } from "express";

import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import careerRoutes from "./career.routes";
import teamRoutes from "./team.routes";
import serviceRoutes from "./service.routes";
import serviceCategoryRoutes from "./service-category.routes";
import locationRoutes from "./location.routes";
import centreRoutes from "./centre.routes";
import cmsRoutes from "./cms.routes";
import aboutRoutes from "./about.routes";
import legalRoutes from "./legal.routes";
import contactRoutes from "./contact.routes";
import homeRoutes from "./home.routes";
import newsGalleryRoutes from "./news-gallery.routes";
import sosPublicRoutes from "./sos-public.routes";
import logoPublicRoutes from "./logo.routes";

// Authenticated / in-app routes
import userRoutes from "./user.routes";
import bookingRoutes from "./booking.routes";
import paymentRoutes from "./payment.routes";
import notificationRoutes from "./notification.routes";
import trackingRoutes from "./tracking.routes";
import sosRoutes from "./sos.routes";
import walletRoutes from "./wallet.routes";
import promoRoutes from "./promo.routes";
import coinRoutes from "./coin.routes";
import supportRoutes from "./support.routes";
import driverRoutes from "./driver.routes";
import driverAuthRoutes from "./driver-auth.routes";
import enterpriseRoutes from "./enterprise.routes";

// Patient-app domains (stub implementations until full backend is built)
import patientRoutes from "./patient.routes";

// Ambulance dispatch (Phase C)
import ambulanceServiceProviderRoutes from "./ambulance-service-provider.routes";
import ambulanceRoutes from "./ambulance.routes";
import ambulanceStaffAdminRoutes from "./ambulance-staff-admin.routes";
import ambulanceDispatchRoutes from "./ambulance-dispatch.routes";
import adminShiftsRoutes from "./admin-shifts.routes";
import adminHospitalsRoutes from "./admin-hospitals.routes";
import sosAlertRoutes from "./sos-alert.routes";
import offDutyReasonAdminRoutes from "./off-duty-reason-admin.routes";

// Ambulance dispatch (Phase D — staff-facing)
import ambulanceStaffAuthRoutes from "./ambulance-staff-auth.routes";
import ambulanceStaffRoutes from "./ambulance-staff.routes";
import ambulanceDispatchActionsRoutes from "./ambulance-dispatch-actions.routes";

// Doctor Panel / Hospital Management System (HMS)
import adminPatientsRoutes from "./admin-patients.routes";
import adminEmrRoutes from "./admin-emr.routes";
import adminInventoryRoutes from "./admin-inventory.routes";
import adminBillingRoutes from "./admin-billing.routes";
import adminReportsRoutes from "./admin-reports.routes";
import adminDashboardRoutes from "./admin-dashboard.routes";
import adminConfigRoutes from "./admin-config.routes";
import adminBookingRoutes from "./admin-booking.routes";
import adminDiagnosticsRoutes from "./admin-diagnostics.routes";
import adminAlertsRoutes from "./admin-alerts.routes";
import adminOpdRoutes from "./admin-opd.routes";
import adminIpdRoutes from "./admin-ipd.routes";

// Pharmacy platform + IVR escalation (non-HMS gaps)
import pharmacyPublicRoutes from "./pharmacy.routes";
import adminPharmaciesRoutes from "./admin-pharmacies.routes";
import ivrPublicRoutes from "./ivr-public.routes";
import adminIvrRoutes from "./admin-ivr.routes";

// HR & Payroll
import adminHrEmployeesRoutes from "./admin-hr-employees.routes";
import adminHrAttendanceRoutes from "./admin-hr-attendance.routes";
import adminHrLeaveRoutes from "./admin-hr-leave.routes";
import adminHrHolidaysRoutes from "./admin-hr-holidays.routes";
import adminHrPayrollRoutes from "./admin-hr-payroll.routes";
import adminHrDashboardRoutes from "./admin-hr-dashboard.routes";

// Patient-app catalog (doctors / pharmacy products / lab tests)
import adminCatalogRoutes from "./admin-catalog.routes";
import adminAmbulanceRequestsRoutes from "./admin-ambulance-requests.routes";

const router = Router();

// ========== Public ==========
router.use("/auth", authRoutes);
router.use("/careers", careerRoutes);
router.use("/team", teamRoutes);
router.use("/services", serviceRoutes);
router.use("/service-categories", serviceCategoryRoutes);
router.use("/location", locationRoutes);
router.use("/centres", centreRoutes);
router.use("/cms", cmsRoutes);
router.use("/about", aboutRoutes);
router.use("/legal", legalRoutes);
router.use("/contact", contactRoutes);
router.use("/home-content", homeRoutes);
router.use("/news-gallery", newsGalleryRoutes);
router.use("/sos-public", sosPublicRoutes);
router.use("/logo", logoPublicRoutes);
router.use("/pharmacies", pharmacyPublicRoutes);
router.use("/ivr", ivrPublicRoutes);

// ========== Driver ==========
router.use("/driver-auth", driverAuthRoutes);
router.use("/driver", driverRoutes);

// ========== Ambulance Staff (Phase D) ==========
router.use("/ambulance-staff-auth", ambulanceStaffAuthRoutes);
router.use("/ambulance-staff", ambulanceStaffRoutes);
router.use("/dispatches", ambulanceDispatchActionsRoutes);

// ========== Authenticated user / patient app ==========
router.use("/users", userRoutes);
router.use("/bookings", bookingRoutes);
router.use("/payments", paymentRoutes);
router.use("/notifications", notificationRoutes);
router.use("/tracking", trackingRoutes);
router.use("/sos", sosRoutes);
router.use("/wallet", walletRoutes);
router.use("/promo", promoRoutes);
router.use("/coins", coinRoutes);
router.use("/support", supportRoutes);
router.use("/enterprise", enterpriseRoutes);

// Patient-app domains (doctors, pharmacy, lab, records, family, home-feed)
router.use("/patient", patientRoutes);

// ========== Admin ==========
router.use("/admin/service-providers", ambulanceServiceProviderRoutes);
router.use("/admin/ambulances", ambulanceRoutes);
router.use("/admin/ambulance-staff", ambulanceStaffAdminRoutes);
router.use("/admin/off-duty-reasons", offDutyReasonAdminRoutes);
router.use("/admin/shifts", adminShiftsRoutes);
router.use("/admin/hospitals", adminHospitalsRoutes);
router.use("/admin/sos-alerts", sosAlertRoutes);

// Doctor Panel / HMS (role-gated inside the routers)
router.use("/admin/patients", adminPatientsRoutes);
router.use("/admin/emr", adminEmrRoutes);
router.use("/admin/inventory", adminInventoryRoutes);
router.use("/admin/billing", adminBillingRoutes);
router.use("/admin/reports", adminReportsRoutes);
router.use("/admin/dashboard", adminDashboardRoutes);
router.use("/admin/config", adminConfigRoutes);
router.use("/admin/bookings", adminBookingRoutes);
router.use("/admin/diagnostics", adminDiagnosticsRoutes);
router.use("/admin/alerts", adminAlertsRoutes);
router.use("/admin/opd", adminOpdRoutes);
router.use("/admin/ipd", adminIpdRoutes);
router.use("/admin/pharmacies", adminPharmaciesRoutes);
router.use("/admin/ivr-escalations", adminIvrRoutes);

// HR & Payroll (role-gated inside the routers)
router.use("/admin/hr/employees", adminHrEmployeesRoutes);
router.use("/admin/hr/attendance", adminHrAttendanceRoutes);
router.use("/admin/hr/leave", adminHrLeaveRoutes);
router.use("/admin/hr/holidays", adminHrHolidaysRoutes);
router.use("/admin/hr/payroll", adminHrPayrollRoutes);
router.use("/admin/hr/dashboard", adminHrDashboardRoutes);

// Patient-app catalog management
router.use("/admin/catalog", adminCatalogRoutes);
router.use("/admin/ambulance-requests", adminAmbulanceRequestsRoutes);

router.use("/admin", ambulanceDispatchRoutes);
router.use("/admin", adminRoutes);

export default router;
