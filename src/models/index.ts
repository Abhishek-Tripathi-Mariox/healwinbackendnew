import mongoose from "mongoose";
import config from "../config";

// Import all models
import User from "./Users";
import UserAddress from "./UserAddress";
import Driver from "./driver.model";
import DriverKyc from "./driver-kyc.model";
import DriverLocation from "./driver-location.model";
import DriverVehicle from "./driver-vehicle.model";
import Vehicle from "./vehicle.model";
import VehicleCategory from "./vehicle-category.model";
import VehicleType from "./vehicle-type.model";
import Booking from "./booking.model";
import Wallet from "./wallet.model";
import WalletTransaction from "./wallet-transaction.model";
import RewardTransaction from "./reward-transaction.model";
import UserGST from "./user-gst.model";

// New models for complete functionality
import PromoCode from "./promo-code.model";
import PromoUsage from "./promo-usage.model";
import ServiceType from "./service-type.model";
import AddonService from "./addon-service.model";
import GoodsType from "./goods-type.model";
import { CoinWallet, CoinTransaction } from "./coin.model";
import { SupportTicket, SupportMessage } from "./support-ticket.model";
import { Enterprise, EnterpriseUser } from "./enterprise.model";
import CancellationReason from "./cancellation-reason.model";
import { TimeSlot, ScheduleConfig } from "./time-slot.model";
import { AppConfig, FareConfig, ServiceArea } from "./app-config.model";
import { Notification, PushTemplate } from "./notification.model";
import Invoice from "./invoice.model";
import { Admin, AdminSession } from "./admin.model";
import { Content, FAQ, Language } from "./content.model";
import { EmergencyContact, SOSAlert } from "./sos.model";
import { SOSSubmission } from "./sos-submission.model";
import { EmergencyDispatch } from "./emergency-dispatch.model";
import { TeamMember } from "./team-member.model";
import { Service } from "./service.model";
import { ServiceCategory } from "./service-category.model";
import { State } from "./state.model";
import { District } from "./district.model";
import { Division } from "./division.model";
import { Department } from "./department.model";
import { Designation } from "./designation.model";
import { EmploymentType } from "./employment-type.model";
import { LocatorServiceType } from "./locator-service-type.model";
import { Centre } from "./centre.model";
import { CmsPage } from "./cms-page.model";
import { AboutContent } from "./about-content.model";
import { EmailTemplate } from "./email-template.model";
import { SmtpSettings } from "./smtp-settings.model";
import { SmsSettings } from "./sms-settings.model";
import AmbulanceServiceProvider from "./ambulance-service-provider.model";
import Ambulance from "./ambulance.model";
import AmbulanceStaff from "./ambulance-staff.model";

mongoose.set("strictQuery", true);

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

// Connection listeners
mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected");
});

// Complete model registry
export const models = {
  // User related
  User,
  UserAddress,
  UserGST,

  // Driver related
  Driver,
  DriverKyc,
  DriverLocation,
  DriverVehicle,

  // Vehicle related
  Vehicle,
  VehicleCategory,
  VehicleType,

  // Booking related
  Booking,
  ServiceType,
  AddonService,
  GoodsType,
  CancellationReason,
  TimeSlot,
  ScheduleConfig,
  Invoice,

  // Wallet & Rewards
  Wallet,
  WalletTransaction,
  RewardTransaction,
  CoinWallet,
  CoinTransaction,

  // Promo related
  PromoCode,
  PromoUsage,

  // Support related
  SupportTicket,
  SupportMessage,

  // Enterprise
  Enterprise,
  EnterpriseUser,

  // Config & Settings
  AppConfig,
  FareConfig,
  ServiceArea,

  // Notifications
  Notification,
  PushTemplate,

  // Admin
  Admin,
  AdminSession,

  // Content
  Content,
  FAQ,
  Language,

  // SOS/Emergency
  EmergencyContact,
  SOSAlert,

  // Team
  TeamMember,

  // Services
  Service,
  ServiceCategory,

  // Location Master Data
  State,
  District,
  Division,
  Department,
  Designation,
  EmploymentType,
  LocatorServiceType,

  // Centre Locator
  Centre,

  // CMS
  CmsPage,

  // About Page
  AboutContent,

  // Email Templates
  EmailTemplate,

  // SMTP Settings
  SmtpSettings,

  // SMS Settings
  SmsSettings,

  // Ambulance
  AmbulanceServiceProvider,
  Ambulance,
  AmbulanceStaff,
} as const;

export default connectDB;

export type ModelName = keyof typeof models;
