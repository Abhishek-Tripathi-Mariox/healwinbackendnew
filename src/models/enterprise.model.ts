import mongoose, { Schema, Types } from "mongoose";

export interface IEnterprise {
  _id: Types.ObjectId;
  companyName: string;
  gstin?: string;
  email: string;
  phone: string;
  contactPerson: string;
  address: string;
  district: string;
  state: string;
  pincode: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejectionReason?: string;
  creditLimit: number;
  usedCredit: number;
  paymentTerms: number; // Days
  discountPercentage: number;
  isActive: boolean;
}

export interface IEnterpriseUser {
  _id: Types.ObjectId;
  enterpriseId: Types.ObjectId;
  userId: Types.ObjectId;
  role: "ADMIN" | "MANAGER" | "USER";
  permissions: string[];
  isActive: boolean;
}

// Enterprise Schema
const EnterpriseSchema = new Schema<IEnterprise>(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    contactPerson: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    district: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
      index: true,
    },
    rejectionReason: String,
    creditLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedCredit: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentTerms: {
      type: Number,
      default: 30, // 30 days
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 50,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Enterprise User Schema
const EnterpriseUserSchema = new Schema<IEnterpriseUser>(
  {
    enterpriseId: {
      type: Schema.Types.ObjectId,
      ref: "Enterprise",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "USER"],
      default: "USER",
    },
    permissions: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Compound indexes
EnterpriseUserSchema.index({ enterpriseId: 1, userId: 1 }, { unique: true });

export const Enterprise = mongoose.model<IEnterprise>(
  "Enterprise",
  EnterpriseSchema,
);
export const EnterpriseUser = mongoose.model<IEnterpriseUser>(
  "EnterpriseUser",
  EnterpriseUserSchema,
);
