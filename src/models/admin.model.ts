import mongoose, { Schema, Types } from "mongoose";

export interface IAdmin {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  roleId: Types.ObjectId; // Reference to Role model
  roleName?: string; // Cached role name for quick access
  permissions: string[]; // Computed from role + custom overrides
  customPermissions?: string[]; // Additional permissions beyond role
  profileImage?: string;
  // Doctor display profile — only used when the admin's role is "Doctor".
  // Surfaced to the patient app's "Consult a Doctor" list (single source of
  // truth — the doctor logs into the panel AND is listed in the app).
  /**
   * Facility this staff member operates, if any. A lab technician assigned to
   * a Lab sees and reports only that lab's diagnostic orders; a pharmacist
   * assigned to a Pharmacy works only that pharmacy's dispense queue.
   * Unset = not facility-scoped (admins, doctors, front desk) and they see all.
   * Mirrors the AmbulanceStaff.hospitalId pattern already in use.
   */
  labId?: Types.ObjectId;
  pharmacyId?: Types.ObjectId;
  doctorProfile?: {
    speciality?: string;
    qualification?: string;
    experienceYears?: number;
    consultationFee?: number;
    /** Medical council registration no. — printed on the prescription. */
    registrationNumber?: string;
    rating?: number;
    reviewCount?: number;
    hospital?: string;
    languages?: string[];
    teleconsult?: boolean;
    about?: string;
    listInApp?: boolean; // show in the patient app directory
  };
  isActive: boolean;
  isDeleted: boolean;
  lastLogin?: Date;
  passwordChangedAt?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdBy?: Types.ObjectId;
}

export interface IAdminSession {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  token: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  isActive: boolean;
}

// Admin Schema
const AdminSchema = new Schema<IAdmin>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    phone: String,
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },
    roleName: {
      type: String,
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    customPermissions: {
      type: [String],
      default: [],
    },
    profileImage: String,
    labId: { type: Schema.Types.ObjectId, ref: "Lab", index: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", index: true },
    doctorProfile: {
      type: new Schema(
        {
          speciality: String,
          qualification: String,
          experienceYears: { type: Number, default: 0 },
          consultationFee: { type: Number, default: 0 },
          registrationNumber: { type: String, trim: true },
          rating: { type: Number, default: 0 },
          reviewCount: { type: Number, default: 0 },
          hospital: String,
          languages: { type: [String], default: [] },
          teleconsult: { type: Boolean, default: true },
          about: String,
          listInApp: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    passwordChangedAt: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true },
);

// Admin Session Schema
const AdminSessionSchema = new Schema<IAdminSession>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      index: true,
    },
    ipAddress: String,
    userAgent: String,
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Compound indexes
AdminSchema.index({ email: 1, isDeleted: 1 });
AdminSessionSchema.index({ adminId: 1, isActive: 1 });

export const Admin = mongoose.model<IAdmin>("Admin", AdminSchema);
export const AdminSession = mongoose.model<IAdminSession>(
  "AdminSession",
  AdminSessionSchema,
);
