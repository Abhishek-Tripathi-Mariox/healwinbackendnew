import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Employee record.
 *
 * One document = one person on the org payroll. This is intentionally
 * independent of the `Admin` login model: most employees never log into the
 * admin panel, and an Admin login is not always an employee. Org master data
 * (department / designation / employment type) is referenced from the existing
 * masters so HR reuses what the rest of the panel already manages.
 *
 * The embedded `salaryStructure` is the basis for every monthly payroll run —
 * the payroll engine reads it together with the month's attendance summary to
 * compute earnings, statutory deductions and net pay.
 */

export type EmployeeStatus = "active" | "on_leave" | "inactive" | "terminated";

export interface IOtherAllowance {
  name: string;
  amount: number;
}

export interface ISalaryStructure {
  ctcAnnual: number;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  otherAllowances: IOtherAllowance[];
  // Statutory applicability — lets HR opt an employee out of a component.
  pfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
}

export interface IHrEmployee {
  _id: Types.ObjectId;
  employeeCode: string; // e.g. HWE-000123
  fullName: string;
  email?: string;
  phone?: string;
  gender?: "male" | "female" | "other";
  dob?: Date;
  address?: string;
  joiningDate: Date;
  exitDate?: Date;

  departmentId?: Types.ObjectId;
  designationId?: Types.ObjectId;
  employmentTypeId?: Types.ObjectId;
  reportingToId?: Types.ObjectId;
  photo?: string;

  status: EmployeeStatus;

  // Bank
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;

  // Statutory IDs
  pan?: string;
  aadhaar?: string;
  uan?: string;
  pfNumber?: string;
  esiNumber?: string;

  salaryStructure: ISalaryStructure;

  isActive: boolean;
  isDeleted: boolean;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OtherAllowanceSchema = new Schema<IOtherAllowance>(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

const SalaryStructureSchema = new Schema<ISalaryStructure>(
  {
    ctcAnnual: { type: Number, default: 0 },
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medical: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    otherAllowances: { type: [OtherAllowanceSchema], default: [] },
    pfApplicable: { type: Boolean, default: true },
    esiApplicable: { type: Boolean, default: true },
    ptApplicable: { type: Boolean, default: true },
  },
  { _id: false },
);

const HrEmployeeSchema = new Schema<IHrEmployee>(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    gender: { type: String, enum: ["male", "female", "other"] },
    dob: Date,
    address: { type: String, trim: true },
    joiningDate: { type: Date, required: true },
    exitDate: Date,

    departmentId: { type: Schema.Types.ObjectId, ref: "Department", index: true },
    designationId: { type: Schema.Types.ObjectId, ref: "Designation" },
    employmentTypeId: { type: Schema.Types.ObjectId, ref: "EmploymentType" },
    reportingToId: { type: Schema.Types.ObjectId, ref: "HrEmployee" },
    photo: String,

    status: {
      type: String,
      enum: ["active", "on_leave", "inactive", "terminated"],
      default: "active",
      index: true,
    },

    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifsc: { type: String, trim: true, uppercase: true },

    pan: { type: String, trim: true, uppercase: true },
    aadhaar: { type: String, trim: true },
    uan: { type: String, trim: true },
    pfNumber: { type: String, trim: true },
    esiNumber: { type: String, trim: true },

    salaryStructure: {
      type: SalaryStructureSchema,
      default: () => ({}),
    },

    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

HrEmployeeSchema.index({ fullName: "text", employeeCode: "text", email: "text" });

export const HrEmployee = mongoose.model<IHrEmployee>(
  "HrEmployee",
  HrEmployeeSchema,
);

export default HrEmployee;
