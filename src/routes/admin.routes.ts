import { Router } from "express";

import * as AdminAuthController from "../controllers/admin/admin-auth.controller";
import * as CareerController from "../controllers/admin/career.controller";
import * as ApplicationController from "../controllers/admin/application.controller";
import * as TeamController from "../controllers/admin/team.controller";
import * as ServiceController from "../controllers/admin/service.controller";
import * as ServiceCategoryController from "../controllers/admin/service-category.controller";
import * as StateAdminController from "../controllers/admin/state-admin.controller";
import * as DistrictAdminController from "../controllers/admin/district-admin.controller";
import * as DivisionAdminController from "../controllers/admin/division-admin.controller";
import * as DepartmentAdminController from "../controllers/admin/department-admin.controller";
import * as DesignationAdminController from "../controllers/admin/designation-admin.controller";
import * as EmploymentTypeAdminController from "../controllers/admin/employment-type-admin.controller";
import * as LocatorServiceTypeController from "../controllers/admin/locator-service-type-admin.controller";
import * as CentreAdminController from "../controllers/admin/centre-admin.controller";
import * as CentreRequestAdminController from "../controllers/admin/centre-request-admin.controller";
import * as CmsAdminController from "../controllers/admin/cms-admin.controller";
import * as AboutAdminController from "../controllers/admin/about-admin.controller";
import * as LegalAdminController from "../controllers/admin/legal-admin.controller";
import * as ContactAdminController from "../controllers/admin/contact-admin.controller";
import * as HomeAdminController from "../controllers/admin/home-admin.controller";
import * as NewsAdminController from "../controllers/admin/news-admin.controller";
import * as GalleryAdminController from "../controllers/admin/gallery-admin.controller";
import * as ArticleSubmissionAdminController from "../controllers/admin/article-submission-admin.controller";
import * as SOSSubmissionController from "../controllers/admin/sos-submission.controller";
import * as EmergencyDispatchController from "../controllers/admin/emergency-dispatch.controller";
import * as AdminSOSController from "../controllers/admin/sos.controller";
import * as StaffController from "../controllers/admin/staff.controller";
import * as LogoAdminController from "../controllers/admin/logo-admin.controller";
import * as ActivityLogController from "../controllers/admin/activity-log.controller";
import * as EmailTemplateController from "../controllers/admin/email-template.controller";
import * as SmsSettingsController from "../controllers/admin/sms-settings.controller";
import * as AdminNotificationController from "../controllers/admin/notification.controller";
import * as AdminUserController from "../controllers/admin/user.controller";
import AdminAuthMiddleware from "../middlewares/admin-auth.middleware";
import activityLogMiddleware from "../middlewares/activity-log.middleware";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { PERMISSIONS } from "../models/role.model";
import upload from "../middlewares/upload.middleware";

const adminRouter = Router();
const { verifyAdminToken, requirePermission } = AdminAuthMiddleware();

// Activity logging middleware — runs after auth, logs all admin mutations
adminRouter.use((req, res, next) => {
  // Only apply after token verification (adminUser is set by verifyAdminToken)
  activityLogMiddleware(req, res, next);
});

// ============ AUTH ONLY ============
adminRouter.post(
  "/auth/login",
  ErrorHandlerMiddleware(AdminAuthController.login),
  ResponseMiddleware,
);

adminRouter.post(
  "/auth/forgot-password",
  ErrorHandlerMiddleware(AdminAuthController.forgotPassword),
  ResponseMiddleware,
);

adminRouter.post(
  "/auth/reset-password",
  ErrorHandlerMiddleware(AdminAuthController.resetPassword),
  ResponseMiddleware,
);

adminRouter.get(
  "/auth/me",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminAuthController.getProfile),
  ResponseMiddleware,
);

adminRouter.post(
  "/auth/logout",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminAuthController.logout),
  ResponseMiddleware,
);

// ============ STAFF & ROLE MANAGEMENT ONLY ============
adminRouter.get(
  "/staff",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_VIEW),
  ErrorHandlerMiddleware(StaffController.getAllStaff),
  ResponseMiddleware,
);

adminRouter.get(
  "/staff/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_VIEW),
  ErrorHandlerMiddleware(StaffController.getStaffById),
  ResponseMiddleware,
);

adminRouter.post(
  "/staff",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_CREATE),
  ErrorHandlerMiddleware(StaffController.createStaff),
  ResponseMiddleware,
);

adminRouter.put(
  "/staff/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_UPDATE),
  ErrorHandlerMiddleware(StaffController.updateStaff),
  ResponseMiddleware,
);

adminRouter.delete(
  "/staff/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_DELETE),
  ErrorHandlerMiddleware(StaffController.deleteStaff),
  ResponseMiddleware,
);

adminRouter.put(
  "/staff/:id/toggle-status",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_UPDATE),
  ErrorHandlerMiddleware(StaffController.toggleStaffStatus),
  ResponseMiddleware,
);

adminRouter.put(
  "/staff/:id/reset-password",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STAFF_UPDATE),
  ErrorHandlerMiddleware(StaffController.resetStaffPassword),
  ResponseMiddleware,
);

adminRouter.get(
  "/roles",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_VIEW),
  ErrorHandlerMiddleware(StaffController.getAllRoles),
  ResponseMiddleware,
);

adminRouter.get(
  "/roles/permissions",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_VIEW),
  ErrorHandlerMiddleware(StaffController.getAllPermissions),
  ResponseMiddleware,
);

adminRouter.get(
  "/roles/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_VIEW),
  ErrorHandlerMiddleware(StaffController.getRoleById),
  ResponseMiddleware,
);

adminRouter.post(
  "/roles",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_CREATE),
  ErrorHandlerMiddleware(StaffController.createRole),
  ResponseMiddleware,
);

adminRouter.put(
  "/roles/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  ErrorHandlerMiddleware(StaffController.updateRole),
  ResponseMiddleware,
);

adminRouter.delete(
  "/roles/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_DELETE),
  ErrorHandlerMiddleware(StaffController.deleteRole),
  ResponseMiddleware,
);

adminRouter.post(
  "/roles/initialize",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ROLES_CREATE),
  ErrorHandlerMiddleware(StaffController.initializeDefaultRoles),
  ResponseMiddleware,
);

adminRouter.get(
  "/sidebar-modules",
  verifyAdminToken,
  ErrorHandlerMiddleware(StaffController.getSidebarModules),
  ResponseMiddleware,
);

// ============ CAREERS ============
adminRouter.get(
  "/careers/departments",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_VIEW),
  ErrorHandlerMiddleware(CareerController.getDepartments),
  ResponseMiddleware,
);

adminRouter.get(
  "/careers/locations",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_VIEW),
  ErrorHandlerMiddleware(CareerController.getLocations),
  ResponseMiddleware,
);

adminRouter.get(
  "/careers/types",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_VIEW),
  ErrorHandlerMiddleware(CareerController.getTypes),
  ResponseMiddleware,
);

adminRouter.get(
  "/careers",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_VIEW),
  ErrorHandlerMiddleware(CareerController.getAllCareers),
  ResponseMiddleware,
);

adminRouter.get(
  "/careers/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_VIEW),
  ErrorHandlerMiddleware(CareerController.getCareerById),
  ResponseMiddleware,
);

adminRouter.post(
  "/careers",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_CREATE),
  ErrorHandlerMiddleware(CareerController.createCareer),
  ResponseMiddleware,
);

adminRouter.put(
  "/careers/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_UPDATE),
  ErrorHandlerMiddleware(CareerController.updateCareer),
  ResponseMiddleware,
);

adminRouter.delete(
  "/careers/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CAREERS_DELETE),
  ErrorHandlerMiddleware(CareerController.deleteCareer),
  ResponseMiddleware,
);

// ============ APPLICATIONS ============
adminRouter.get(
  "/applications/export",
  verifyAdminToken,
  requirePermission(PERMISSIONS.APPLICATIONS_VIEW),
  ErrorHandlerMiddleware(ApplicationController.exportApplications),
  ResponseMiddleware,
);

adminRouter.get(
  "/applications",
  verifyAdminToken,
  requirePermission(PERMISSIONS.APPLICATIONS_VIEW),
  ErrorHandlerMiddleware(ApplicationController.getAllApplications),
  ResponseMiddleware,
);

adminRouter.get(
  "/applications/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.APPLICATIONS_VIEW),
  ErrorHandlerMiddleware(ApplicationController.getApplicationById),
  ResponseMiddleware,
);

adminRouter.put(
  "/applications/:id/status",
  verifyAdminToken,
  requirePermission(PERMISSIONS.APPLICATIONS_UPDATE),
  ErrorHandlerMiddleware(ApplicationController.updateApplicationStatus),
  ResponseMiddleware,
);

// ============ TEAM MEMBERS ============
adminRouter.get(
  "/team/divisions",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_VIEW),
  ErrorHandlerMiddleware(TeamController.getDivisions),
  ResponseMiddleware,
);

adminRouter.get(
  "/team/states",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_VIEW),
  ErrorHandlerMiddleware(TeamController.getStates),
  ResponseMiddleware,
);

adminRouter.get(
  "/team",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_VIEW),
  ErrorHandlerMiddleware(TeamController.getAllMembers),
  ResponseMiddleware,
);

adminRouter.get(
  "/team/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_VIEW),
  ErrorHandlerMiddleware(TeamController.getMemberById),
  ResponseMiddleware,
);

adminRouter.post(
  "/team",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_CREATE),
  upload.single("image"),
  ErrorHandlerMiddleware(TeamController.createMember),
  ResponseMiddleware,
);

adminRouter.put(
  "/team/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_UPDATE),
  upload.single("image"),
  ErrorHandlerMiddleware(TeamController.updateMember),
  ResponseMiddleware,
);

adminRouter.delete(
  "/team/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.TEAM_DELETE),
  ErrorHandlerMiddleware(TeamController.deleteMember),
  ResponseMiddleware,
);

// ============ SERVICES ============
adminRouter.get(
  "/services",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SERVICES_VIEW),
  ErrorHandlerMiddleware(ServiceController.getAllServices),
  ResponseMiddleware,
);

adminRouter.get(
  "/services/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SERVICES_VIEW),
  ErrorHandlerMiddleware(ServiceController.getServiceById),
  ResponseMiddleware,
);

adminRouter.post(
  "/services",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SERVICES_CREATE),
  upload.single("image"),
  ErrorHandlerMiddleware(ServiceController.createService),
  ResponseMiddleware,
);

adminRouter.put(
  "/services/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SERVICES_UPDATE),
  upload.single("image"),
  ErrorHandlerMiddleware(ServiceController.updateService),
  ResponseMiddleware,
);

adminRouter.delete(
  "/services/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SERVICES_DELETE),
  ErrorHandlerMiddleware(ServiceController.deleteService),
  ResponseMiddleware,
);

// ============ SERVICE CATEGORIES ============
adminRouter.get(
  "/service-categories",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CATEGORIES_VIEW),
  ErrorHandlerMiddleware(ServiceCategoryController.getAllCategories),
  ResponseMiddleware,
);

adminRouter.get(
  "/service-categories/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CATEGORIES_VIEW),
  ErrorHandlerMiddleware(ServiceCategoryController.getCategoryById),
  ResponseMiddleware,
);

adminRouter.post(
  "/service-categories",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CATEGORIES_CREATE),
  ErrorHandlerMiddleware(ServiceCategoryController.createCategory),
  ResponseMiddleware,
);

adminRouter.put(
  "/service-categories/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CATEGORIES_UPDATE),
  ErrorHandlerMiddleware(ServiceCategoryController.updateCategory),
  ResponseMiddleware,
);

adminRouter.delete(
  "/service-categories/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CATEGORIES_DELETE),
  ErrorHandlerMiddleware(ServiceCategoryController.deleteCategory),
  ResponseMiddleware,
);

// ============ STATES ============
adminRouter.get(
  "/states",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STATES_VIEW),
  ErrorHandlerMiddleware(StateAdminController.getAllStates),
  ResponseMiddleware,
);
adminRouter.get(
  "/states/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STATES_VIEW),
  ErrorHandlerMiddleware(StateAdminController.getStateById),
  ResponseMiddleware,
);
adminRouter.post(
  "/states",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STATES_CREATE),
  ErrorHandlerMiddleware(StateAdminController.createState),
  ResponseMiddleware,
);
adminRouter.put(
  "/states/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STATES_UPDATE),
  ErrorHandlerMiddleware(StateAdminController.updateState),
  ResponseMiddleware,
);
adminRouter.delete(
  "/states/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.STATES_DELETE),
  ErrorHandlerMiddleware(StateAdminController.deleteState),
  ResponseMiddleware,
);

// ============ DISTRICTS ============
adminRouter.get(
  "/districts",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DISTRICTS_VIEW),
  ErrorHandlerMiddleware(DistrictAdminController.getAllDistricts),
  ResponseMiddleware,
);
adminRouter.get(
  "/districts/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DISTRICTS_VIEW),
  ErrorHandlerMiddleware(DistrictAdminController.getDistrictById),
  ResponseMiddleware,
);
adminRouter.post(
  "/districts",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DISTRICTS_CREATE),
  ErrorHandlerMiddleware(DistrictAdminController.createDistrict),
  ResponseMiddleware,
);
adminRouter.put(
  "/districts/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DISTRICTS_UPDATE),
  ErrorHandlerMiddleware(DistrictAdminController.updateDistrict),
  ResponseMiddleware,
);
adminRouter.delete(
  "/districts/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DISTRICTS_DELETE),
  ErrorHandlerMiddleware(DistrictAdminController.deleteDistrict),
  ResponseMiddleware,
);

// ============ DIVISIONS ============
adminRouter.get(
  "/divisions",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DIVISIONS_VIEW),
  ErrorHandlerMiddleware(DivisionAdminController.getAllDivisions),
  ResponseMiddleware,
);
adminRouter.get(
  "/divisions/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DIVISIONS_VIEW),
  ErrorHandlerMiddleware(DivisionAdminController.getDivisionById),
  ResponseMiddleware,
);
adminRouter.post(
  "/divisions",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DIVISIONS_CREATE),
  ErrorHandlerMiddleware(DivisionAdminController.createDivision),
  ResponseMiddleware,
);
adminRouter.put(
  "/divisions/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DIVISIONS_UPDATE),
  ErrorHandlerMiddleware(DivisionAdminController.updateDivision),
  ResponseMiddleware,
);
adminRouter.delete(
  "/divisions/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DIVISIONS_DELETE),
  ErrorHandlerMiddleware(DivisionAdminController.deleteDivision),
  ResponseMiddleware,
);

// ============ DEPARTMENTS ============
adminRouter.get(
  "/departments",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DEPARTMENTS_VIEW),
  ErrorHandlerMiddleware(DepartmentAdminController.getAllDepartments),
  ResponseMiddleware,
);
adminRouter.get(
  "/departments/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DEPARTMENTS_VIEW),
  ErrorHandlerMiddleware(DepartmentAdminController.getDepartmentById),
  ResponseMiddleware,
);
adminRouter.post(
  "/departments",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DEPARTMENTS_CREATE),
  ErrorHandlerMiddleware(DepartmentAdminController.createDepartment),
  ResponseMiddleware,
);
adminRouter.put(
  "/departments/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DEPARTMENTS_UPDATE),
  ErrorHandlerMiddleware(DepartmentAdminController.updateDepartment),
  ResponseMiddleware,
);
adminRouter.delete(
  "/departments/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DEPARTMENTS_DELETE),
  ErrorHandlerMiddleware(DepartmentAdminController.deleteDepartment),
  ResponseMiddleware,
);

// ============ DESIGNATIONS ============
adminRouter.get(
  "/designations",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DESIGNATIONS_VIEW),
  ErrorHandlerMiddleware(DesignationAdminController.getAllDesignations),
  ResponseMiddleware,
);
adminRouter.get(
  "/designations/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DESIGNATIONS_VIEW),
  ErrorHandlerMiddleware(DesignationAdminController.getDesignationById),
  ResponseMiddleware,
);
adminRouter.post(
  "/designations",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DESIGNATIONS_CREATE),
  ErrorHandlerMiddleware(DesignationAdminController.createDesignation),
  ResponseMiddleware,
);
adminRouter.put(
  "/designations/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DESIGNATIONS_UPDATE),
  ErrorHandlerMiddleware(DesignationAdminController.updateDesignation),
  ResponseMiddleware,
);
adminRouter.delete(
  "/designations/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.DESIGNATIONS_DELETE),
  ErrorHandlerMiddleware(DesignationAdminController.deleteDesignation),
  ResponseMiddleware,
);

// ============ EMPLOYMENT TYPES ============
adminRouter.get(
  "/employment-types",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMPLOYMENT_TYPES_VIEW),
  ErrorHandlerMiddleware(EmploymentTypeAdminController.getAllEmploymentTypes),
  ResponseMiddleware,
);
adminRouter.get(
  "/employment-types/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMPLOYMENT_TYPES_VIEW),
  ErrorHandlerMiddleware(EmploymentTypeAdminController.getEmploymentTypeById),
  ResponseMiddleware,
);
adminRouter.post(
  "/employment-types",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMPLOYMENT_TYPES_CREATE),
  ErrorHandlerMiddleware(EmploymentTypeAdminController.createEmploymentType),
  ResponseMiddleware,
);
adminRouter.put(
  "/employment-types/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMPLOYMENT_TYPES_UPDATE),
  ErrorHandlerMiddleware(EmploymentTypeAdminController.updateEmploymentType),
  ResponseMiddleware,
);
adminRouter.delete(
  "/employment-types/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMPLOYMENT_TYPES_DELETE),
  ErrorHandlerMiddleware(EmploymentTypeAdminController.deleteEmploymentType),
  ResponseMiddleware,
);

// ============ LOCATOR SERVICE TYPES ============
adminRouter.get(
  "/locator-service-types",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOCATOR_TYPES_VIEW),
  ErrorHandlerMiddleware(
    LocatorServiceTypeController.getAllLocatorServiceTypes,
  ),
  ResponseMiddleware,
);
adminRouter.get(
  "/locator-service-types/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOCATOR_TYPES_VIEW),
  ErrorHandlerMiddleware(
    LocatorServiceTypeController.getLocatorServiceTypeById,
  ),
  ResponseMiddleware,
);
adminRouter.post(
  "/locator-service-types",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOCATOR_TYPES_CREATE),
  ErrorHandlerMiddleware(LocatorServiceTypeController.createLocatorServiceType),
  ResponseMiddleware,
);
adminRouter.put(
  "/locator-service-types/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOCATOR_TYPES_UPDATE),
  ErrorHandlerMiddleware(LocatorServiceTypeController.updateLocatorServiceType),
  ResponseMiddleware,
);
adminRouter.delete(
  "/locator-service-types/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOCATOR_TYPES_DELETE),
  ErrorHandlerMiddleware(LocatorServiceTypeController.deleteLocatorServiceType),
  ResponseMiddleware,
);

// ============ CENTRES ============
adminRouter.get(
  "/centres",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRES_VIEW),
  ErrorHandlerMiddleware(CentreAdminController.getAllCentres),
  ResponseMiddleware,
);
adminRouter.get(
  "/centres/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRES_VIEW),
  ErrorHandlerMiddleware(CentreAdminController.getCentreById),
  ResponseMiddleware,
);
adminRouter.post(
  "/centres",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRES_CREATE),
  upload.single("image"),
  ErrorHandlerMiddleware(CentreAdminController.createCentre),
  ResponseMiddleware,
);
adminRouter.put(
  "/centres/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRES_UPDATE),
  upload.single("image"),
  ErrorHandlerMiddleware(CentreAdminController.updateCentre),
  ResponseMiddleware,
);
adminRouter.delete(
  "/centres/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRES_DELETE),
  ErrorHandlerMiddleware(CentreAdminController.deleteCentre),
  ResponseMiddleware,
);

// ============ CENTRE REQUESTS ============
adminRouter.get(
  "/centre-requests",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRE_REQUESTS_VIEW),
  ErrorHandlerMiddleware(CentreRequestAdminController.getAllCentreRequests),
  ResponseMiddleware,
);
adminRouter.get(
  "/centre-requests/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRE_REQUESTS_VIEW),
  ErrorHandlerMiddleware(CentreRequestAdminController.getCentreRequestById),
  ResponseMiddleware,
);
adminRouter.post(
  "/centre-requests/:id/approve",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRE_REQUESTS_UPDATE),
  ErrorHandlerMiddleware(CentreRequestAdminController.approveCentreRequest),
  ResponseMiddleware,
);
adminRouter.post(
  "/centre-requests/:id/reject",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRE_REQUESTS_UPDATE),
  ErrorHandlerMiddleware(CentreRequestAdminController.rejectCentreRequest),
  ResponseMiddleware,
);
adminRouter.delete(
  "/centre-requests/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CENTRE_REQUESTS_DELETE),
  ErrorHandlerMiddleware(CentreRequestAdminController.deleteCentreRequest),
  ResponseMiddleware,
);

// ============ CMS PAGES ============
adminRouter.get(
  "/cms",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CMS_VIEW),
  ErrorHandlerMiddleware(CmsAdminController.getAllCmsPages),
  ResponseMiddleware,
);
adminRouter.get(
  "/cms/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CMS_VIEW),
  ErrorHandlerMiddleware(CmsAdminController.getCmsPageById),
  ResponseMiddleware,
);
adminRouter.post(
  "/cms",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CMS_CREATE),
  ErrorHandlerMiddleware(CmsAdminController.createCmsPage),
  ResponseMiddleware,
);
adminRouter.put(
  "/cms/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CMS_UPDATE),
  ErrorHandlerMiddleware(CmsAdminController.updateCmsPage),
  ResponseMiddleware,
);
adminRouter.delete(
  "/cms/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CMS_DELETE),
  ErrorHandlerMiddleware(CmsAdminController.deleteCmsPage),
  ResponseMiddleware,
);
adminRouter.post(
  "/cms/upload-image",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CMS_CREATE),
  upload.single("image"),
  ErrorHandlerMiddleware(CmsAdminController.uploadCmsImage),
  ResponseMiddleware,
);

// ============ CONTACT PAGE CONTENT ============
adminRouter.get(
  "/contact-content",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_VIEW),
  ErrorHandlerMiddleware(ContactAdminController.getContactContent),
  ResponseMiddleware,
);
adminRouter.put(
  "/contact-content",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_UPDATE),
  ErrorHandlerMiddleware(ContactAdminController.updateContactContent),
  ResponseMiddleware,
);

// ============ CONTACT MESSAGES ============
adminRouter.get(
  "/contact-messages/stats",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_MESSAGES_VIEW),
  ErrorHandlerMiddleware(ContactAdminController.getMessageStats),
  ResponseMiddleware,
);
adminRouter.get(
  "/contact-messages",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_MESSAGES_VIEW),
  ErrorHandlerMiddleware(ContactAdminController.getAllMessages),
  ResponseMiddleware,
);
adminRouter.get(
  "/contact-messages/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_MESSAGES_VIEW),
  ErrorHandlerMiddleware(ContactAdminController.getMessageById),
  ResponseMiddleware,
);
adminRouter.put(
  "/contact-messages/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_MESSAGES_UPDATE),
  ErrorHandlerMiddleware(ContactAdminController.updateMessage),
  ResponseMiddleware,
);
adminRouter.delete(
  "/contact-messages/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.CONTACT_MESSAGES_DELETE),
  ErrorHandlerMiddleware(ContactAdminController.deleteMessage),
  ResponseMiddleware,
);

// ============ ABOUT PAGE CONTENT ============
adminRouter.get(
  "/about-content",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ABOUT_VIEW),
  ErrorHandlerMiddleware(AboutAdminController.getAboutContent),
  ResponseMiddleware,
);
adminRouter.put(
  "/about-content",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ABOUT_UPDATE),
  ErrorHandlerMiddleware(AboutAdminController.updateAboutContent),
  ResponseMiddleware,
);

// ============ LEGAL DOCUMENTS (About / Privacy / T&C) ============
// One singleton per (type, audience) — the admin page edits all six
// cells from a single tabbed surface.
adminRouter.get(
  "/legal-documents",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LEGAL_VIEW),
  ErrorHandlerMiddleware(LegalAdminController.listLegalDocuments),
  ResponseMiddleware,
);
adminRouter.get(
  "/legal-documents/:type/:audience",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LEGAL_VIEW),
  ErrorHandlerMiddleware(LegalAdminController.getLegalDocument),
  ResponseMiddleware,
);
adminRouter.put(
  "/legal-documents/:type/:audience",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LEGAL_UPDATE),
  ErrorHandlerMiddleware(LegalAdminController.upsertLegalDocument),
  ResponseMiddleware,
);

// ============ HOME PAGE CONTENT ============
adminRouter.get(
  "/home-content",
  verifyAdminToken,
  requirePermission(PERMISSIONS.HOME_VIEW),
  ErrorHandlerMiddleware(HomeAdminController.getHomeContent),
  ResponseMiddleware,
);
adminRouter.put(
  "/home-content",
  verifyAdminToken,
  requirePermission(PERMISSIONS.HOME_UPDATE),
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "appMockupImage", maxCount: 1 },
  ]),
  ErrorHandlerMiddleware(HomeAdminController.updateHomeContent),
  ResponseMiddleware,
);

// ============ NEWS ARTICLES ============
adminRouter.get(
  "/news/categories",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_VIEW),
  ErrorHandlerMiddleware(NewsAdminController.getArticleCategories),
  ResponseMiddleware,
);
adminRouter.get(
  "/news",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_VIEW),
  ErrorHandlerMiddleware(NewsAdminController.getAllArticles),
  ResponseMiddleware,
);
adminRouter.get(
  "/news/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_VIEW),
  ErrorHandlerMiddleware(NewsAdminController.getArticleById),
  ResponseMiddleware,
);
adminRouter.post(
  "/news/upload-image",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_CREATE),
  upload.single("image"),
  ErrorHandlerMiddleware(NewsAdminController.uploadContentImage),
  ResponseMiddleware,
);
adminRouter.post(
  "/news",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_CREATE),
  upload.array("images", 10),
  ErrorHandlerMiddleware(NewsAdminController.createArticle),
  ResponseMiddleware,
);
adminRouter.put(
  "/news/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_UPDATE),
  upload.array("images", 10),
  ErrorHandlerMiddleware(NewsAdminController.updateArticle),
  ResponseMiddleware,
);
adminRouter.delete(
  "/news/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NEWS_DELETE),
  ErrorHandlerMiddleware(NewsAdminController.deleteArticle),
  ResponseMiddleware,
);

// ============ GALLERY IMAGES ============
adminRouter.get(
  "/gallery/categories",
  verifyAdminToken,
  requirePermission(PERMISSIONS.GALLERY_VIEW),
  ErrorHandlerMiddleware(GalleryAdminController.getGalleryCategories),
  ResponseMiddleware,
);
adminRouter.get(
  "/gallery",
  verifyAdminToken,
  requirePermission(PERMISSIONS.GALLERY_VIEW),
  ErrorHandlerMiddleware(GalleryAdminController.getAllImages),
  ResponseMiddleware,
);
adminRouter.get(
  "/gallery/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.GALLERY_VIEW),
  ErrorHandlerMiddleware(GalleryAdminController.getImageById),
  ResponseMiddleware,
);
adminRouter.post(
  "/gallery",
  verifyAdminToken,
  requirePermission(PERMISSIONS.GALLERY_CREATE),
  upload.array("images", 10),
  ErrorHandlerMiddleware(GalleryAdminController.createImage),
  ResponseMiddleware,
);
adminRouter.put(
  "/gallery/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.GALLERY_UPDATE),
  upload.array("images", 10),
  ErrorHandlerMiddleware(GalleryAdminController.updateImage),
  ResponseMiddleware,
);
adminRouter.delete(
  "/gallery/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.GALLERY_DELETE),
  ErrorHandlerMiddleware(GalleryAdminController.deleteImage),
  ResponseMiddleware,
);

// ============ ARTICLE SUBMISSIONS ============
adminRouter.get(
  "/article-submissions",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SUBMISSIONS_VIEW),
  ErrorHandlerMiddleware(ArticleSubmissionAdminController.getAllSubmissions),
  ResponseMiddleware,
);
adminRouter.get(
  "/article-submissions/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SUBMISSIONS_VIEW),
  ErrorHandlerMiddleware(ArticleSubmissionAdminController.getSubmissionById),
  ResponseMiddleware,
);
adminRouter.put(
  "/article-submissions/:id/review",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SUBMISSIONS_UPDATE),
  ErrorHandlerMiddleware(ArticleSubmissionAdminController.reviewSubmission),
  ResponseMiddleware,
);
adminRouter.delete(
  "/article-submissions/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.SUBMISSIONS_DELETE),
  ErrorHandlerMiddleware(ArticleSubmissionAdminController.deleteSubmission),
  ResponseMiddleware,
);

// ============ SOS SUBMISSIONS (Public SOS management) ============
adminRouter.get(
  "/sos-submissions",
  verifyAdminToken,
  ErrorHandlerMiddleware(SOSSubmissionController.getAllSubmissions),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos-submissions/stats",
  verifyAdminToken,
  ErrorHandlerMiddleware(SOSSubmissionController.getSubmissionStats),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos-submissions/locations",
  verifyAdminToken,
  ErrorHandlerMiddleware(SOSSubmissionController.getSubmissionsWithLocation),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos-submissions/:id",
  verifyAdminToken,
  ErrorHandlerMiddleware(SOSSubmissionController.getSubmissionDetails),
  ResponseMiddleware,
);
adminRouter.put(
  "/sos-submissions/:id/status",
  verifyAdminToken,
  ErrorHandlerMiddleware(SOSSubmissionController.updateSubmissionStatus),
  ResponseMiddleware,
);

// ============ EMERGENCY DISPATCHES ============
adminRouter.post(
  "/sos-submissions/:id/dispatch",
  verifyAdminToken,
  ErrorHandlerMiddleware(EmergencyDispatchController.createDispatch),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos-submissions/:id/dispatches",
  verifyAdminToken,
  ErrorHandlerMiddleware(
    EmergencyDispatchController.getDispatchesForSubmission,
  ),
  ResponseMiddleware,
);
adminRouter.get(
  "/dispatches",
  verifyAdminToken,
  ErrorHandlerMiddleware(EmergencyDispatchController.getAllDispatches),
  ResponseMiddleware,
);
adminRouter.get(
  "/dispatches/stats",
  verifyAdminToken,
  ErrorHandlerMiddleware(EmergencyDispatchController.getDispatchStats),
  ResponseMiddleware,
);
adminRouter.put(
  "/dispatches/:dispatchId/status",
  verifyAdminToken,
  ErrorHandlerMiddleware(EmergencyDispatchController.updateDispatchStatus),
  ResponseMiddleware,
);

// ============ SOS ALERTS (Booking-based emergency alerts) ============
adminRouter.get(
  "/sos/active",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.getActiveSOSAlerts),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos/stats",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.getSOSStats),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.getAllSOSAlerts),
  ResponseMiddleware,
);
adminRouter.get(
  "/sos/:sosId",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.getSOSDetails),
  ResponseMiddleware,
);
adminRouter.put(
  "/sos/:sosId/respond",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.respondToSOS),
  ResponseMiddleware,
);
adminRouter.put(
  "/sos/:sosId/resolve",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.resolveSOS),
  ResponseMiddleware,
);
adminRouter.post(
  "/sos/:sosId/notify-police",
  verifyAdminToken,
  ErrorHandlerMiddleware(AdminSOSController.notifyPolice),
  ResponseMiddleware,
);

// ============ LOGO SETTINGS ============
adminRouter.get(
  "/logo-settings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOGO_SETTINGS_VIEW),
  ErrorHandlerMiddleware(LogoAdminController.getLogoSettings),
  ResponseMiddleware,
);
adminRouter.put(
  "/logo-settings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.LOGO_SETTINGS_UPDATE),
  upload.fields([
    { name: "titleLogo", maxCount: 1 },
    { name: "mainLogo", maxCount: 1 },
  ]),
  ErrorHandlerMiddleware(LogoAdminController.updateLogoSettings),
  ResponseMiddleware,
);

// ============ ACTIVITY LOGS (Super Admin only) ============
adminRouter.get(
  "/activity-logs",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_VIEW),
  ErrorHandlerMiddleware(ActivityLogController.getActivityLogs),
  ResponseMiddleware,
);
adminRouter.get(
  "/activity-logs/staff",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_VIEW),
  ErrorHandlerMiddleware(ActivityLogController.getStaffList),
  ResponseMiddleware,
);
adminRouter.get(
  "/activity-logs/modules",
  verifyAdminToken,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_VIEW),
  ErrorHandlerMiddleware(ActivityLogController.getModuleList),
  ResponseMiddleware,
);

// ============ EMAIL TEMPLATES ============
adminRouter.get(
  "/email-templates/placeholders",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(EmailTemplateController.getPlaceholders),
  ResponseMiddleware,
);
adminRouter.get(
  "/email-templates/smtp-status",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(EmailTemplateController.getSmtpStatus),
  ResponseMiddleware,
);
adminRouter.get(
  "/email-templates",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(EmailTemplateController.getAllTemplates),
  ResponseMiddleware,
);
adminRouter.get(
  "/email-templates/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(EmailTemplateController.getTemplateById),
  ResponseMiddleware,
);
adminRouter.post(
  "/email-templates",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_CREATE),
  ErrorHandlerMiddleware(EmailTemplateController.createTemplate),
  ResponseMiddleware,
);
adminRouter.put(
  "/email-templates/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_UPDATE),
  ErrorHandlerMiddleware(EmailTemplateController.updateTemplate),
  ResponseMiddleware,
);
adminRouter.delete(
  "/email-templates/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_DELETE),
  ErrorHandlerMiddleware(EmailTemplateController.deleteTemplate),
  ResponseMiddleware,
);
adminRouter.post(
  "/email-templates/test",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_UPDATE),
  ErrorHandlerMiddleware(EmailTemplateController.sendTestEmail),
  ResponseMiddleware,
);

// ============ SMTP SETTINGS ============
adminRouter.get(
  "/smtp-settings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(EmailTemplateController.getSmtpSettings),
  ResponseMiddleware,
);
adminRouter.put(
  "/smtp-settings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_UPDATE),
  ErrorHandlerMiddleware(EmailTemplateController.updateSmtpSettings),
  ResponseMiddleware,
);
adminRouter.post(
  "/smtp-settings/test",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_UPDATE),
  ErrorHandlerMiddleware(EmailTemplateController.testSmtpConnection),
  ResponseMiddleware,
);

// ============ SMS SETTINGS ============
adminRouter.get(
  "/sms-settings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(SmsSettingsController.getSmsSettings),
  ResponseMiddleware,
);
adminRouter.get(
  "/sms-settings/status",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_VIEW),
  ErrorHandlerMiddleware(SmsSettingsController.getSmsStatus),
  ResponseMiddleware,
);
adminRouter.put(
  "/sms-settings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_UPDATE),
  ErrorHandlerMiddleware(SmsSettingsController.updateSmsSettings),
  ResponseMiddleware,
);
adminRouter.post(
  "/sms-settings/test",
  verifyAdminToken,
  requirePermission(PERMISSIONS.EMAIL_TEMPLATES_UPDATE),
  ErrorHandlerMiddleware(SmsSettingsController.testSmsConnection),
  ResponseMiddleware,
);

// ============ NOTIFICATIONS ============
adminRouter.get(
  "/notifications/stats",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW),
  ErrorHandlerMiddleware(AdminNotificationController.stats),
  ResponseMiddleware,
);
adminRouter.get(
  "/notifications/history",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW),
  ErrorHandlerMiddleware(AdminNotificationController.listNotifications),
  ResponseMiddleware,
);
adminRouter.get(
  "/notifications/users",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  ErrorHandlerMiddleware(AdminNotificationController.searchUsers),
  ResponseMiddleware,
);
adminRouter.post(
  "/notifications/broadcast",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  ErrorHandlerMiddleware(AdminNotificationController.broadcastNotification),
  ResponseMiddleware,
);
adminRouter.post(
  "/notifications/send-to-user",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  ErrorHandlerMiddleware(AdminNotificationController.sendToUser),
  ResponseMiddleware,
);
adminRouter.post(
  "/notifications/promo",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  ErrorHandlerMiddleware(AdminNotificationController.sendPromoNotification),
  ResponseMiddleware,
);
adminRouter.delete(
  "/notifications/cleanup",
  verifyAdminToken,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  ErrorHandlerMiddleware(AdminNotificationController.cleanupNotifications),
  ResponseMiddleware,
);

// ============ USER MANAGEMENT (Patient app users) ============
adminRouter.get(
  "/users/stats",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getUserStats),
  ResponseMiddleware,
);

adminRouter.get(
  "/users",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getAllUsers),
  ResponseMiddleware,
);

adminRouter.get(
  "/users/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getUserById),
  ResponseMiddleware,
);

adminRouter.put(
  "/users/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.updateUser),
  ResponseMiddleware,
);

adminRouter.patch(
  "/users/:id/status",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.updateUserStatus),
  ResponseMiddleware,
);

adminRouter.post(
  "/users/:id/block",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_BLOCK),
  ErrorHandlerMiddleware(AdminUserController.blockUser),
  ResponseMiddleware,
);

adminRouter.post(
  "/users/:id/unblock",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_BLOCK),
  ErrorHandlerMiddleware(AdminUserController.unblockUser),
  ResponseMiddleware,
);

adminRouter.delete(
  "/users/:id",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_DELETE),
  ErrorHandlerMiddleware(AdminUserController.deleteUser),
  ResponseMiddleware,
);

adminRouter.post(
  "/users/:id/restore",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_DELETE),
  ErrorHandlerMiddleware(AdminUserController.restoreUser),
  ResponseMiddleware,
);

adminRouter.get(
  "/users/:id/bookings",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getUserBookings),
  ResponseMiddleware,
);

adminRouter.get(
  "/users/:id/wallet",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getUserWallet),
  ResponseMiddleware,
);

adminRouter.post(
  "/users/:id/wallet/credit",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.addWalletBalance),
  ResponseMiddleware,
);

adminRouter.get(
  "/users/:id/transactions",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getUserTransactions),
  ResponseMiddleware,
);

adminRouter.get(
  "/users/:id/addresses",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_VIEW),
  ErrorHandlerMiddleware(AdminUserController.getUserAddresses),
  ResponseMiddleware,
);

adminRouter.post(
  "/users/:id/addresses",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.addUserAddress),
  ResponseMiddleware,
);

adminRouter.put(
  "/users/:id/addresses/:addressId",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.updateUserAddress),
  ResponseMiddleware,
);

adminRouter.delete(
  "/users/:id/addresses/:addressId",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.deleteUserAddress),
  ResponseMiddleware,
);

adminRouter.patch(
  "/users/:id/addresses/:addressId/primary",
  verifyAdminToken,
  requirePermission(PERMISSIONS.USERS_UPDATE),
  ErrorHandlerMiddleware(AdminUserController.setAddressPrimary),
  ResponseMiddleware,
);

export default adminRouter;
