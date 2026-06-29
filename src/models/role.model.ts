import mongoose, { Schema, Types } from "mongoose";

// Define all available permissions in the system
export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: "dashboard:view",

  // User Management
  USERS_VIEW: "users:view",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  USERS_BLOCK: "users:block",

  // Driver Management
  DRIVERS_VIEW: "drivers:view",
  DRIVERS_CREATE: "drivers:create",
  DRIVERS_UPDATE: "drivers:update",
  DRIVERS_DELETE: "drivers:delete",
  DRIVERS_VERIFY: "drivers:verify",
  DRIVERS_BLOCK: "drivers:block",

  // Vehicle Management
  VEHICLES_VIEW: "vehicles:view",
  VEHICLES_CREATE: "vehicles:create",
  VEHICLES_UPDATE: "vehicles:update",
  VEHICLES_DELETE: "vehicles:delete",

  // Booking/Order Management
  BOOKINGS_VIEW: "bookings:view",
  BOOKINGS_CREATE: "bookings:create",
  BOOKINGS_UPDATE: "bookings:update",
  BOOKINGS_CANCEL: "bookings:cancel",
  BOOKINGS_REFUND: "bookings:refund",

  // Payment Management
  PAYMENTS_VIEW: "payments:view",
  PAYMENTS_PROCESS: "payments:process",
  PAYMENTS_REFUND: "payments:refund",

  // Promo Management
  PROMOS_VIEW: "promos:view",
  PROMOS_CREATE: "promos:create",
  PROMOS_UPDATE: "promos:update",
  PROMOS_DELETE: "promos:delete",

  // Enterprise Management
  ENTERPRISES_VIEW: "enterprises:view",
  ENTERPRISES_CREATE: "enterprises:create",
  ENTERPRISES_UPDATE: "enterprises:update",
  ENTERPRISES_APPROVE: "enterprises:approve",
  ENTERPRISES_SUSPEND: "enterprises:suspend",

  // SOS/Emergency
  SOS_VIEW: "sos:view",
  SOS_RESPOND: "sos:respond",
  SOS_RESOLVE: "sos:resolve",

  // Tracking
  TRACKING_VIEW: "tracking:view",

  // Notifications
  NOTIFICATIONS_VIEW: "notifications:view",
  NOTIFICATIONS_SEND: "notifications:send",

  // Support Tickets
  SUPPORT_VIEW: "support:view",
  SUPPORT_RESPOND: "support:respond",
  SUPPORT_RESOLVE: "support:resolve",
  SUPPORT_ASSIGN: "support:assign",

  // Staff Management
  STAFF_VIEW: "staff:view",
  STAFF_CREATE: "staff:create",
  STAFF_UPDATE: "staff:update",
  STAFF_DELETE: "staff:delete",

  // Role Management
  ROLES_VIEW: "roles:view",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",

  // Settings
  SETTINGS_VIEW: "settings:view",
  SETTINGS_UPDATE: "settings:update",

  // Logo Management
  LOGO_SETTINGS_VIEW: "logo_settings:view",
  LOGO_SETTINGS_UPDATE: "logo_settings:update",

  // Reports
  REPORTS_VIEW: "reports:view",
  REPORTS_EXPORT: "reports:export",

  // Careers
  CAREERS_VIEW: "careers:view",
  CAREERS_CREATE: "careers:create",
  CAREERS_UPDATE: "careers:update",
  CAREERS_DELETE: "careers:delete",

  // Applications
  APPLICATIONS_VIEW: "applications:view",
  APPLICATIONS_UPDATE: "applications:update",

  // Team Members
  TEAM_VIEW: "team:view",
  TEAM_CREATE: "team:create",
  TEAM_UPDATE: "team:update",
  TEAM_DELETE: "team:delete",

  // Services
  SERVICES_VIEW: "services:view",
  SERVICES_CREATE: "services:create",
  SERVICES_UPDATE: "services:update",
  SERVICES_DELETE: "services:delete",
  // Service Categories
  CATEGORIES_VIEW: "categories:view",
  CATEGORIES_CREATE: "categories:create",
  CATEGORIES_UPDATE: "categories:update",
  CATEGORIES_DELETE: "categories:delete",

  // States
  STATES_VIEW: "states:view",
  STATES_CREATE: "states:create",
  STATES_UPDATE: "states:update",
  STATES_DELETE: "states:delete",

  // Districts
  DISTRICTS_VIEW: "districts:view",
  DISTRICTS_CREATE: "districts:create",
  DISTRICTS_UPDATE: "districts:update",
  DISTRICTS_DELETE: "districts:delete",

  // Divisions
  DIVISIONS_VIEW: "divisions:view",
  DIVISIONS_CREATE: "divisions:create",
  DIVISIONS_UPDATE: "divisions:update",
  DIVISIONS_DELETE: "divisions:delete",

  // Departments
  DEPARTMENTS_VIEW: "departments:view",
  DEPARTMENTS_CREATE: "departments:create",
  DEPARTMENTS_UPDATE: "departments:update",
  DEPARTMENTS_DELETE: "departments:delete",

  // Designations
  DESIGNATIONS_VIEW: "designations:view",
  DESIGNATIONS_CREATE: "designations:create",
  DESIGNATIONS_UPDATE: "designations:update",
  DESIGNATIONS_DELETE: "designations:delete",

  // Employment Types
  EMPLOYMENT_TYPES_VIEW: "employment_types:view",
  EMPLOYMENT_TYPES_CREATE: "employment_types:create",
  EMPLOYMENT_TYPES_UPDATE: "employment_types:update",
  EMPLOYMENT_TYPES_DELETE: "employment_types:delete",

  // Locator Service Types
  LOCATOR_TYPES_VIEW: "locator_types:view",
  LOCATOR_TYPES_CREATE: "locator_types:create",
  LOCATOR_TYPES_UPDATE: "locator_types:update",
  LOCATOR_TYPES_DELETE: "locator_types:delete",

  // Centres
  CENTRES_VIEW: "centres:view",
  CENTRES_CREATE: "centres:create",
  CENTRES_UPDATE: "centres:update",
  CENTRES_DELETE: "centres:delete",

  // Centre Requests
  CENTRE_REQUESTS_VIEW: "centre_requests:view",
  CENTRE_REQUESTS_UPDATE: "centre_requests:update",
  CENTRE_REQUESTS_DELETE: "centre_requests:delete",

  // CMS
  CMS_VIEW: "cms:view",
  CMS_CREATE: "cms:create",
  CMS_UPDATE: "cms:update",
  CMS_DELETE: "cms:delete",

  // Contact Page
  CONTACT_VIEW: "contact:view",
  CONTACT_UPDATE: "contact:update",
  CONTACT_MESSAGES_VIEW: "contact-messages:view",
  CONTACT_MESSAGES_UPDATE: "contact-messages:update",
  CONTACT_MESSAGES_DELETE: "contact-messages:delete",

  // About Page
  ABOUT_VIEW: "about:view",
  ABOUT_UPDATE: "about:update",

  // Legal Documents (About / Privacy / Terms for app audiences)
  LEGAL_VIEW: "legal:view",
  LEGAL_UPDATE: "legal:update",

  // Home Page
  HOME_VIEW: "home:view",
  HOME_UPDATE: "home:update",

  // News & Gallery
  NEWS_VIEW: "news:view",
  NEWS_CREATE: "news:create",
  NEWS_UPDATE: "news:update",
  NEWS_DELETE: "news:delete",
  GALLERY_VIEW: "gallery:view",
  GALLERY_CREATE: "gallery:create",
  GALLERY_UPDATE: "gallery:update",
  GALLERY_DELETE: "gallery:delete",
  SUBMISSIONS_VIEW: "submissions:view",
  SUBMISSIONS_UPDATE: "submissions:update",
  SUBMISSIONS_DELETE: "submissions:delete",

  // Email Templates
  EMAIL_TEMPLATES_VIEW: "email_templates:view",
  EMAIL_TEMPLATES_CREATE: "email_templates:create",
  EMAIL_TEMPLATES_UPDATE: "email_templates:update",
  EMAIL_TEMPLATES_DELETE: "email_templates:delete",

  // Activity Logs
  ACTIVITY_LOGS_VIEW: "activity_logs:view",

  // ===== Doctor Panel / Hospital Management System (HMS) =====
  // Patient Registration / Demographics
  HMS_PATIENTS_VIEW: "hms_patients:view",
  HMS_PATIENTS_CREATE: "hms_patients:create",
  HMS_PATIENTS_UPDATE: "hms_patients:update",
  HMS_PATIENTS_DELETE: "hms_patients:delete",

  // EMR (Electronic Medical Record — SOAP encounters)
  EMR_VIEW: "emr:view",
  EMR_CREATE: "emr:create",
  EMR_UPDATE: "emr:update",

  // Inventory Management (supplies / consumables / equipment)
  INVENTORY_VIEW: "inventory:view",
  INVENTORY_CREATE: "inventory:create",
  INVENTORY_UPDATE: "inventory:update",
  INVENTORY_DELETE: "inventory:delete",
  INVENTORY_ADJUST: "inventory:adjust", // stock in/out movements

  // Billing Management
  BILLING_VIEW: "billing:view",
  BILLING_CREATE: "billing:create",
  BILLING_UPDATE: "billing:update",
  BILLING_PAYMENT: "billing:payment",
  BILLING_REFUND: "billing:refund",
  BILLING_REPORTS: "billing:reports",

  // OPD (Out-Patient Department)
  OPD_VIEW: "opd:view",
  OPD_MANAGE: "opd:manage",

  // IPD (In-Patient Department) + beds/wards
  IPD_VIEW: "ipd:view",
  IPD_MANAGE: "ipd:manage",
  BEDS_VIEW: "beds:view",
  BEDS_MANAGE: "beds:manage",

  // Pharmacy platform (onboarding / listings / locator)
  PHARMACIES_VIEW: "pharmacies:view",
  PHARMACIES_CREATE: "pharmacies:create",
  PHARMACIES_UPDATE: "pharmacies:update",
  PHARMACIES_DELETE: "pharmacies:delete",
  PHARMACIES_APPROVE: "pharmacies:approve",

  // IVR escalation (SOS phone-tree)
  IVR_VIEW: "ivr:view",
  IVR_MANAGE: "ivr:manage",

  // ===== HR & Payroll =====
  HR_DASHBOARD_VIEW: "hr_dashboard:view",

  // Employees
  EMPLOYEES_VIEW: "employees:view",
  EMPLOYEES_CREATE: "employees:create",
  EMPLOYEES_UPDATE: "employees:update",
  EMPLOYEES_DELETE: "employees:delete",

  // Salary structure / CTC
  SALARY_STRUCTURE_VIEW: "salary_structure:view",
  SALARY_STRUCTURE_MANAGE: "salary_structure:manage",

  // Attendance
  ATTENDANCE_VIEW: "attendance:view",
  ATTENDANCE_MANAGE: "attendance:manage",

  // Leave
  LEAVE_VIEW: "leave:view",
  LEAVE_MANAGE: "leave:manage",
  LEAVE_APPROVE: "leave:approve",

  // Holidays
  HOLIDAYS_VIEW: "holidays:view",
  HOLIDAYS_MANAGE: "holidays:manage",

  // Payroll
  PAYROLL_VIEW: "payroll:view",
  PAYROLL_PROCESS: "payroll:process",
  PAYROLL_FINALIZE: "payroll:finalize",

  // Patient-app catalog (doctors / pharmacy products / lab tests)
  CATALOG_VIEW: "catalog:view",
  CATALOG_MANAGE: "catalog:manage",
} as const;

// Group permissions by module for frontend display
export const PERMISSION_GROUPS = {
  Dashboard: [PERMISSIONS.DASHBOARD_VIEW],
  "User Management": [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_BLOCK,
  ],
  "Driver Management": [
    PERMISSIONS.DRIVERS_VIEW,
    PERMISSIONS.DRIVERS_CREATE,
    PERMISSIONS.DRIVERS_UPDATE,
    PERMISSIONS.DRIVERS_DELETE,
    PERMISSIONS.DRIVERS_VERIFY,
    PERMISSIONS.DRIVERS_BLOCK,
  ],
  "Vehicle Management": [
    PERMISSIONS.VEHICLES_VIEW,
    PERMISSIONS.VEHICLES_CREATE,
    PERMISSIONS.VEHICLES_UPDATE,
    PERMISSIONS.VEHICLES_DELETE,
  ],
  "Booking Management": [
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_CREATE,
    PERMISSIONS.BOOKINGS_UPDATE,
    PERMISSIONS.BOOKINGS_CANCEL,
    PERMISSIONS.BOOKINGS_REFUND,
  ],
  "Payment Management": [
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PAYMENTS_PROCESS,
    PERMISSIONS.PAYMENTS_REFUND,
  ],
  "Promo Management": [
    PERMISSIONS.PROMOS_VIEW,
    PERMISSIONS.PROMOS_CREATE,
    PERMISSIONS.PROMOS_UPDATE,
    PERMISSIONS.PROMOS_DELETE,
  ],
  "Enterprise Management": [
    PERMISSIONS.ENTERPRISES_VIEW,
    PERMISSIONS.ENTERPRISES_CREATE,
    PERMISSIONS.ENTERPRISES_UPDATE,
    PERMISSIONS.ENTERPRISES_APPROVE,
  ],
  "SOS/Emergency": [
    PERMISSIONS.SOS_VIEW,
    PERMISSIONS.SOS_RESPOND,
    PERMISSIONS.SOS_RESOLVE,
  ],
  Tracking: [PERMISSIONS.TRACKING_VIEW],
  Notifications: [
    PERMISSIONS.NOTIFICATIONS_VIEW,
    PERMISSIONS.NOTIFICATIONS_SEND,
  ],
  "Support Tickets": [
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_RESPOND,
    PERMISSIONS.SUPPORT_RESOLVE,
  ],
  "Admin Management": [
    PERMISSIONS.STAFF_VIEW,
    PERMISSIONS.STAFF_CREATE,
    PERMISSIONS.STAFF_UPDATE,
    PERMISSIONS.STAFF_DELETE,
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.ROLES_DELETE,
  ],
  Settings: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_UPDATE],
  "Logo Management": [
    PERMISSIONS.LOGO_SETTINGS_VIEW,
    PERMISSIONS.LOGO_SETTINGS_UPDATE,
  ],
  Reports: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT],
  Careers: [
    PERMISSIONS.CAREERS_VIEW,
    PERMISSIONS.CAREERS_CREATE,
    PERMISSIONS.CAREERS_UPDATE,
    PERMISSIONS.CAREERS_DELETE,
  ],
  Applications: [
    PERMISSIONS.APPLICATIONS_VIEW,
    PERMISSIONS.APPLICATIONS_UPDATE,
  ],
  "Team Management": [
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.TEAM_CREATE,
    PERMISSIONS.TEAM_UPDATE,
    PERMISSIONS.TEAM_DELETE,
  ],
  Services: [
    PERMISSIONS.SERVICES_VIEW,
    PERMISSIONS.SERVICES_CREATE,
    PERMISSIONS.SERVICES_UPDATE,
    PERMISSIONS.SERVICES_DELETE,
  ],
  "Service Categories": [
    PERMISSIONS.CATEGORIES_VIEW,
    PERMISSIONS.CATEGORIES_CREATE,
    PERMISSIONS.CATEGORIES_UPDATE,
    PERMISSIONS.CATEGORIES_DELETE,
  ],
  States: [
    PERMISSIONS.STATES_VIEW,
    PERMISSIONS.STATES_CREATE,
    PERMISSIONS.STATES_UPDATE,
    PERMISSIONS.STATES_DELETE,
  ],
  Districts: [
    PERMISSIONS.DISTRICTS_VIEW,
    PERMISSIONS.DISTRICTS_CREATE,
    PERMISSIONS.DISTRICTS_UPDATE,
    PERMISSIONS.DISTRICTS_DELETE,
  ],
  Divisions: [
    PERMISSIONS.DIVISIONS_VIEW,
    PERMISSIONS.DIVISIONS_CREATE,
    PERMISSIONS.DIVISIONS_UPDATE,
    PERMISSIONS.DIVISIONS_DELETE,
  ],
  Departments: [
    PERMISSIONS.DEPARTMENTS_VIEW,
    PERMISSIONS.DEPARTMENTS_CREATE,
    PERMISSIONS.DEPARTMENTS_UPDATE,
    PERMISSIONS.DEPARTMENTS_DELETE,
  ],
  Designations: [
    PERMISSIONS.DESIGNATIONS_VIEW,
    PERMISSIONS.DESIGNATIONS_CREATE,
    PERMISSIONS.DESIGNATIONS_UPDATE,
    PERMISSIONS.DESIGNATIONS_DELETE,
  ],
  "Employment Types": [
    PERMISSIONS.EMPLOYMENT_TYPES_VIEW,
    PERMISSIONS.EMPLOYMENT_TYPES_CREATE,
    PERMISSIONS.EMPLOYMENT_TYPES_UPDATE,
    PERMISSIONS.EMPLOYMENT_TYPES_DELETE,
  ],
  "Locator Service Types": [
    PERMISSIONS.LOCATOR_TYPES_VIEW,
    PERMISSIONS.LOCATOR_TYPES_CREATE,
    PERMISSIONS.LOCATOR_TYPES_UPDATE,
    PERMISSIONS.LOCATOR_TYPES_DELETE,
  ],
  Centres: [
    PERMISSIONS.CENTRES_VIEW,
    PERMISSIONS.CENTRES_CREATE,
    PERMISSIONS.CENTRES_UPDATE,
    PERMISSIONS.CENTRES_DELETE,
  ],
  "Centre Requests": [
    PERMISSIONS.CENTRE_REQUESTS_VIEW,
    PERMISSIONS.CENTRE_REQUESTS_UPDATE,
    PERMISSIONS.CENTRE_REQUESTS_DELETE,
  ],
  CMS: [
    PERMISSIONS.CMS_VIEW,
    PERMISSIONS.CMS_CREATE,
    PERMISSIONS.CMS_UPDATE,
    PERMISSIONS.CMS_DELETE,
  ],
  "Contact Page": [PERMISSIONS.CONTACT_VIEW, PERMISSIONS.CONTACT_UPDATE],
  "Contact Messages": [
    PERMISSIONS.CONTACT_MESSAGES_VIEW,
    PERMISSIONS.CONTACT_MESSAGES_UPDATE,
    PERMISSIONS.CONTACT_MESSAGES_DELETE,
  ],
  "About Page": [PERMISSIONS.ABOUT_VIEW, PERMISSIONS.ABOUT_UPDATE],
  "Home Page": [PERMISSIONS.HOME_VIEW, PERMISSIONS.HOME_UPDATE],
  "News Articles": [
    PERMISSIONS.NEWS_VIEW,
    PERMISSIONS.NEWS_CREATE,
    PERMISSIONS.NEWS_UPDATE,
    PERMISSIONS.NEWS_DELETE,
  ],
  Gallery: [
    PERMISSIONS.GALLERY_VIEW,
    PERMISSIONS.GALLERY_CREATE,
    PERMISSIONS.GALLERY_UPDATE,
    PERMISSIONS.GALLERY_DELETE,
  ],
  "Article Submissions": [
    PERMISSIONS.SUBMISSIONS_VIEW,
    PERMISSIONS.SUBMISSIONS_UPDATE,
    PERMISSIONS.SUBMISSIONS_DELETE,
  ],
  "Email Templates": [
    PERMISSIONS.EMAIL_TEMPLATES_VIEW,
    PERMISSIONS.EMAIL_TEMPLATES_CREATE,
    PERMISSIONS.EMAIL_TEMPLATES_UPDATE,
    PERMISSIONS.EMAIL_TEMPLATES_DELETE,
  ],
  "Activity Logs": [PERMISSIONS.ACTIVITY_LOGS_VIEW],
  "Doctor Panel — Patients": [
    PERMISSIONS.HMS_PATIENTS_VIEW,
    PERMISSIONS.HMS_PATIENTS_CREATE,
    PERMISSIONS.HMS_PATIENTS_UPDATE,
    PERMISSIONS.HMS_PATIENTS_DELETE,
  ],
  "Doctor Panel — EMR": [
    PERMISSIONS.EMR_VIEW,
    PERMISSIONS.EMR_CREATE,
    PERMISSIONS.EMR_UPDATE,
  ],
  "Doctor Panel — Inventory": [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,
    PERMISSIONS.INVENTORY_DELETE,
    PERMISSIONS.INVENTORY_ADJUST,
  ],
  "Doctor Panel — Billing": [
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_UPDATE,
    PERMISSIONS.BILLING_PAYMENT,
    PERMISSIONS.BILLING_REFUND,
    PERMISSIONS.BILLING_REPORTS,
  ],
  "Doctor Panel — OPD/IPD": [
    PERMISSIONS.OPD_VIEW,
    PERMISSIONS.OPD_MANAGE,
    PERMISSIONS.IPD_VIEW,
    PERMISSIONS.IPD_MANAGE,
    PERMISSIONS.BEDS_VIEW,
    PERMISSIONS.BEDS_MANAGE,
  ],
  Pharmacies: [
    PERMISSIONS.PHARMACIES_VIEW,
    PERMISSIONS.PHARMACIES_CREATE,
    PERMISSIONS.PHARMACIES_UPDATE,
    PERMISSIONS.PHARMACIES_DELETE,
    PERMISSIONS.PHARMACIES_APPROVE,
  ],
  "IVR Escalation": [PERMISSIONS.IVR_VIEW, PERMISSIONS.IVR_MANAGE],
  "HR — Dashboard": [PERMISSIONS.HR_DASHBOARD_VIEW],
  "HR — Employees": [
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.EMPLOYEES_CREATE,
    PERMISSIONS.EMPLOYEES_UPDATE,
    PERMISSIONS.EMPLOYEES_DELETE,
    PERMISSIONS.SALARY_STRUCTURE_VIEW,
    PERMISSIONS.SALARY_STRUCTURE_MANAGE,
  ],
  "HR — Attendance": [
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
  ],
  "HR — Leave": [
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.LEAVE_APPROVE,
  ],
  "HR — Holidays": [PERMISSIONS.HOLIDAYS_VIEW, PERMISSIONS.HOLIDAYS_MANAGE],
  "HR — Payroll": [
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_PROCESS,
    PERMISSIONS.PAYROLL_FINALIZE,
  ],
  "Patient Catalog": [PERMISSIONS.CATALOG_VIEW, PERMISSIONS.CATALOG_MANAGE],
};

// Sidebar modules mapping to permissions
export const SIDEBAR_MODULES = {
  sos: [PERMISSIONS.SOS_VIEW],
  staff: [PERMISSIONS.STAFF_VIEW],
  careers: [PERMISSIONS.CAREERS_VIEW],
  applications: [PERMISSIONS.APPLICATIONS_VIEW],
  team: [PERMISSIONS.TEAM_VIEW],
  services: [PERMISSIONS.SERVICES_VIEW],
  categories: [PERMISSIONS.CATEGORIES_VIEW],
  states: [PERMISSIONS.STATES_VIEW],
  districts: [PERMISSIONS.DISTRICTS_VIEW],
  divisions: [PERMISSIONS.DIVISIONS_VIEW],
  departments: [PERMISSIONS.DEPARTMENTS_VIEW],
  designations: [PERMISSIONS.DESIGNATIONS_VIEW],
  "employment-types": [PERMISSIONS.EMPLOYMENT_TYPES_VIEW],
  "locator-types": [PERMISSIONS.LOCATOR_TYPES_VIEW],
  centres: [PERMISSIONS.CENTRES_VIEW],
  "centre-requests": [PERMISSIONS.CENTRE_REQUESTS_VIEW],
  cms: [PERMISSIONS.CMS_VIEW],
  contact: [PERMISSIONS.CONTACT_VIEW],
  "contact-messages": [PERMISSIONS.CONTACT_MESSAGES_VIEW],
  about: [PERMISSIONS.ABOUT_VIEW],
  home: [PERMISSIONS.HOME_VIEW],
  news: [PERMISSIONS.NEWS_VIEW],
  gallery: [PERMISSIONS.GALLERY_VIEW],
  submissions: [PERMISSIONS.SUBMISSIONS_VIEW],
  "logo-settings": [PERMISSIONS.LOGO_SETTINGS_VIEW],
  "activity-logs": [PERMISSIONS.ACTIVITY_LOGS_VIEW],
  "email-templates": [PERMISSIONS.EMAIL_TEMPLATES_VIEW],
  patients: [PERMISSIONS.HMS_PATIENTS_VIEW],
  inventory: [PERMISSIONS.INVENTORY_VIEW],
  billing: [PERMISSIONS.BILLING_VIEW],
  opd: [PERMISSIONS.OPD_VIEW],
  ipd: [PERMISSIONS.IPD_VIEW],
  beds: [PERMISSIONS.BEDS_VIEW],
  pharmacies: [PERMISSIONS.PHARMACIES_VIEW],
  "ivr-escalations": [PERMISSIONS.IVR_VIEW],
  // HR & Payroll
  hr: [PERMISSIONS.HR_DASHBOARD_VIEW],
  employees: [PERMISSIONS.EMPLOYEES_VIEW],
  attendance: [PERMISSIONS.ATTENDANCE_VIEW],
  leave: [PERMISSIONS.LEAVE_VIEW],
  holidays: [PERMISSIONS.HOLIDAYS_VIEW],
  payroll: [PERMISSIONS.PAYROLL_VIEW],
  catalog: [PERMISSIONS.CATALOG_VIEW],
};

export interface IRole {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean; // System roles can't be deleted
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function (permissions: string[]) {
          const allPermissions = Object.values(PERMISSIONS);
          return permissions.every((p) => allPermissions.includes(p as any));
        },
        message: "Invalid permission found",
      },
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true },
);

// Note: name already has unique: true which creates an index — no need for separate .index()
RoleSchema.index({ isActive: 1 });

export const Role = mongoose.model<IRole>("Role", RoleSchema);

// Default system roles
export const DEFAULT_ROLES = {
  SUPER_ADMIN: {
    name: "Super Admin",
    description: "Full access to all features",
    permissions: Object.values(PERMISSIONS),
    isSystem: true,
  },
  ADMIN: {
    name: "Admin",
    description: "Administrative access with most features",
    permissions: Object.values(PERMISSIONS).filter(
      (p) => !p.startsWith("roles:") && p !== PERMISSIONS.STAFF_DELETE,
    ),
    isSystem: true,
  },
  MANAGER: {
    name: "Manager",
    description: "Operational management access",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.DRIVERS_VIEW,
      PERMISSIONS.DRIVERS_UPDATE,
      PERMISSIONS.DRIVERS_VERIFY,
      PERMISSIONS.VEHICLES_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_UPDATE,
      PERMISSIONS.BOOKINGS_CANCEL,
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.PROMOS_VIEW,
      PERMISSIONS.SOS_VIEW,
      PERMISSIONS.SOS_RESPOND,
      PERMISSIONS.TRACKING_VIEW,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.SUPPORT_RESPOND,
      PERMISSIONS.REPORTS_VIEW,
    ],
    isSystem: true,
  },
  SUPPORT: {
    name: "Support",
    description: "Customer support access",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.DRIVERS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.SOS_VIEW,
      PERMISSIONS.SOS_RESPOND,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.SUPPORT_RESPOND,
      PERMISSIONS.SUPPORT_RESOLVE,
      PERMISSIONS.TRACKING_VIEW,
    ],
    isSystem: true,
  },
  CALL_CENTRE: {
    name: "Call Centre Executive",
    description:
      "Ground staff / call centre — receives SOS & call requests, finalizes and dispatches all ambulance bookings, monitors & manually assigns drivers, toggles crew duty, and enrolls patients on the move",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.USERS_VIEW,
      // SOS handling
      PERMISSIONS.SOS_VIEW,
      PERMISSIONS.SOS_RESPOND,
      PERMISSIONS.SOS_RESOLVE,
      // Finalize / dispatch all ambulance bookings
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_CREATE,
      PERMISSIONS.BOOKINGS_UPDATE,
      PERMISSIONS.BOOKINGS_CANCEL,
      // Monitor + manually assign drivers / crew, toggle duty
      PERMISSIONS.DRIVERS_VIEW,
      PERMISSIONS.DRIVERS_UPDATE,
      PERMISSIONS.VEHICLES_VIEW,
      PERMISSIONS.STAFF_VIEW,
      PERMISSIONS.TRACKING_VIEW,
      // Coordinate with family / hospital
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.SUPPORT_RESPOND,
      // Patient enrollment on the move
      PERMISSIONS.HMS_PATIENTS_VIEW,
      PERMISSIONS.HMS_PATIENTS_CREATE,
    ],
    isSystem: true,
  },
  FINANCE: {
    name: "Finance",
    description: "Financial operations access",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.PAYMENTS_PROCESS,
      PERMISSIONS.PAYMENTS_REFUND,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_REFUND,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.ENTERPRISES_VIEW,
    ],
    isSystem: true,
  },
  DOCTOR: {
    name: "Doctor",
    description:
      "Hospital doctor — patient registration, EMR (SOAP), OPD/IPD and clinical workflows",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.HMS_PATIENTS_VIEW,
      PERMISSIONS.HMS_PATIENTS_CREATE,
      PERMISSIONS.HMS_PATIENTS_UPDATE,
      PERMISSIONS.EMR_VIEW,
      PERMISSIONS.EMR_CREATE,
      PERMISSIONS.EMR_UPDATE,
      PERMISSIONS.OPD_VIEW,
      PERMISSIONS.OPD_MANAGE,
      PERMISSIONS.IPD_VIEW,
      PERMISSIONS.IPD_MANAGE,
      PERMISSIONS.BEDS_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.BILLING_VIEW,
    ],
    isSystem: true,
  },
  HOSPITAL_STAFF: {
    name: "Hospital Staff",
    description:
      "Front-desk / ward staff — registration, inventory, billing and OPD/IPD operations",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.HMS_PATIENTS_VIEW,
      PERMISSIONS.HMS_PATIENTS_CREATE,
      PERMISSIONS.HMS_PATIENTS_UPDATE,
      PERMISSIONS.EMR_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_CREATE,
      PERMISSIONS.INVENTORY_UPDATE,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.BILLING_VIEW,
      PERMISSIONS.BILLING_CREATE,
      PERMISSIONS.BILLING_UPDATE,
      PERMISSIONS.BILLING_PAYMENT,
      PERMISSIONS.OPD_VIEW,
      PERMISSIONS.OPD_MANAGE,
      PERMISSIONS.IPD_VIEW,
      PERMISSIONS.IPD_MANAGE,
      PERMISSIONS.BEDS_VIEW,
      PERMISSIONS.BEDS_MANAGE,
    ],
    isSystem: true,
  },
  HR_MANAGER: {
    name: "HR Manager",
    description:
      "Human Resources — employees, attendance, leave, holidays and payroll / salary slips",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.HR_DASHBOARD_VIEW,
      PERMISSIONS.EMPLOYEES_VIEW,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_DELETE,
      PERMISSIONS.SALARY_STRUCTURE_VIEW,
      PERMISSIONS.SALARY_STRUCTURE_MANAGE,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.LEAVE_VIEW,
      PERMISSIONS.LEAVE_MANAGE,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.HOLIDAYS_VIEW,
      PERMISSIONS.HOLIDAYS_MANAGE,
      PERMISSIONS.PAYROLL_VIEW,
      PERMISSIONS.PAYROLL_PROCESS,
      PERMISSIONS.PAYROLL_FINALIZE,
    ],
    isSystem: true,
  },
};

export default Role;
