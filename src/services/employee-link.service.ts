import { Types } from "mongoose";
import HrEmployee from "../models/hr-employee.model";
import { Admin, AdminSession } from "../models/admin.model";
import Role from "../models/role.model";
import { nextSequence } from "../models/counter.model";
import bcrypt from "bcryptjs";
import { sendPanelCredentials } from "./account-email.service";

/**
 * Keeping panel logins and HR records in step.
 *
 * Someone added under Team Management is a HealWin employee — they were just
 * being created as a login and nothing else, so they never appeared in HR and
 * nobody could record their department, salary or attendance. And an employee
 * created in HR who needs to use the panel had to be created a second time by
 * hand, with the two records free to drift apart.
 *
 * Both directions now create the other half and link them with
 * `HrEmployee.linkedAdminId`, which already existed and was only ever set
 * manually.
 */

const pad = (n: number) => String(n).padStart(6, "0");

export interface LinkResult {
  employeeId: Types.ObjectId;
  employeeCode: string;
  /** True when a new HR record was created rather than an existing one linked. */
  created: boolean;
}

/**
 * Make sure a panel admin has an HR record, and that it points back at them.
 *
 * If someone with the same email is already on the HR roll — the common case
 * when an existing employee is later given a login — that record is linked
 * rather than duplicated. Creating a second one would split their attendance
 * and payroll across two people.
 */
export const ensureEmployeeForAdmin = async (
  admin: {
    _id: Types.ObjectId | string;
    fullName: string;
    email?: string;
    phone?: string;
  },
  createdByAdminId?: Types.ObjectId | string,
): Promise<LinkResult | null> => {
  const adminId = new Types.ObjectId(String(admin._id));

  // Already linked — nothing to do.
  const linked = await HrEmployee.findOne({
    linkedAdminId: adminId,
    isDeleted: false,
  })
    .select("_id employeeCode")
    .lean();
  if (linked) {
    return {
      employeeId: (linked as any)._id,
      employeeCode: (linked as any).employeeCode,
      created: false,
    };
  }

  const email = String(admin.email || "").toLowerCase().trim();
  if (email) {
    const byEmail = await HrEmployee.findOne({ email, isDeleted: false });
    if (byEmail) {
      byEmail.linkedAdminId = adminId;
      await byEmail.save();
      return {
        employeeId: byEmail._id,
        employeeCode: byEmail.employeeCode,
        created: false,
      };
    }
  }

  // A joining date is required on the HR record and nobody is asked for one
  // when creating a login, so today stands in — HR corrects it along with the
  // rest of the details.
  const seq = await nextSequence("hr_employee");
  const employee = await HrEmployee.create({
    employeeCode: `HWE-${pad(seq)}`,
    fullName: admin.fullName,
    email: email || undefined,
    phone: admin.phone || undefined,
    joiningDate: new Date(),
    status: "active",
    linkedAdminId: adminId,
    createdByAdminId: createdByAdminId || adminId,
  });

  return {
    employeeId: employee._id,
    employeeCode: employee.employeeCode,
    created: true,
  };
};

export interface AdminForEmployeeInput {
  fullName: string;
  email?: string;
  phone?: string;
  roleId: string;
  /** Optional — one is generated when not supplied. */
  password?: string;
  createdBy?: Types.ObjectId | string;
}

export interface AdminForEmployeeResult {
  adminId: Types.ObjectId;
  roleName: string;
  /** Whether the credentials email actually went out. */
  emailSent?: boolean;
  emailError?: string;
  /**
   * Only present when this call generated one. Returned once so it can be
   * handed to the person; it is stored hashed and cannot be read back.
   */
  temporaryPassword?: string;
}

/**
 * Change the system role on an employee's panel login, creating the login if
 * they do not have one yet.
 *
 * Permissions are recomputed from the new role, keeping any custom grants the
 * account carries — dropping those silently would quietly take away access
 * somebody was deliberately given.
 *
 * Returns the login details when one was created, so a generated password can
 * be shown once.
 */
export const setPanelRole = async (
  employee: {
    _id: Types.ObjectId;
    fullName: string;
    email?: string;
    phone?: string;
    linkedAdminId?: Types.ObjectId | null;
  },
  roleId: string,
  actorId?: Types.ObjectId | string,
): Promise<AdminForEmployeeResult | null> => {
  const role = await Role.findOne({ _id: roleId, isActive: true });
  if (!role) throw new Error("Select a valid role.");

  if (!employee.linkedAdminId) {
    return createAdminForEmployee({
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      roleId,
      createdBy: actorId,
    });
  }

  const admin = await Admin.findOne({
    _id: employee.linkedAdminId,
    isDeleted: { $ne: true },
  });
  if (!admin) {
    throw new Error(
      "The linked panel login no longer exists. Remove the link and create a new one.",
    );
  }

  if (String(admin.roleId) === String(role._id)) return null; // nothing to do

  admin.roleId = role._id;
  admin.roleName = role.name;
  admin.permissions = [
    ...new Set([...role.permissions, ...(admin.customPermissions || [])]),
  ];
  await admin.save();
  return null;
};

/**
 * Reset a panel password and tell the owner.
 *
 * Every session is signed out: a reset happens when access needs to change
 * hands, and leaving the old sessions alive would mean the previous holder
 * keeps working until their token expires.
 */
export const resetAdminPassword = async (
  adminId: Types.ObjectId | string,
  password?: string,
): Promise<{ email: string; password: string; emailSent: boolean }> => {
  const admin = await Admin.findOne({ _id: adminId, isDeleted: { $ne: true } });
  if (!admin) throw new Error("That panel login no longer exists.");

  const value = password || generatePassword();
  admin.password = await bcrypt.hash(value, 12);
  admin.passwordChangedAt = new Date();
  await admin.save();

  await AdminSession.updateMany({ adminId: admin._id }, { isActive: false });

  const mail = await sendPanelCredentials({
    fullName: admin.fullName,
    email: admin.email,
    password: value,
    roleName: admin.roleName || "",
  });

  return { email: admin.email, password: value, emailSent: mail.sent };
};

/** A readable one-time password — no ambiguous characters to mistype. */
const generatePassword = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out}@1`;
};

/**
 * Give an employee a panel login.
 *
 * Throws with a message meant for the person on screen — the caller surfaces
 * it as a validation failure rather than a 500.
 */
export const createAdminForEmployee = async (
  input: AdminForEmployeeInput,
): Promise<AdminForEmployeeResult> => {
  const email = String(input.email || "").toLowerCase().trim();
  if (!email) {
    throw new Error("An email address is required to create a panel login.");
  }

  const existing = await Admin.findOne({ email, isDeleted: false })
    .select("_id")
    .lean();
  if (existing) {
    throw new Error(
      `${email} already has a panel login. Link the existing account instead of creating a second one.`,
    );
  }

  const role = await Role.findOne({ _id: input.roleId, isActive: true });
  if (!role) throw new Error("Select a valid role for the panel login.");

  const generated = input.password ? undefined : generatePassword();
  const password = input.password || generated!;
  if (password.length < 8) {
    throw new Error("The password must be at least 8 characters.");
  }

  const admin = await Admin.create({
    fullName: input.fullName,
    email,
    password: await bcrypt.hash(password, 12),
    phone: input.phone,
    roleId: role._id,
    roleName: role.name,
    permissions: role.permissions,
    customPermissions: [],
    createdBy: input.createdBy,
  });

  // The one moment the password exists in readable form — it is hashed from
  // here on and cannot be recovered, so if it is not sent now the only way
  // back in is a reset.
  const mail = await sendPanelCredentials({
    fullName: input.fullName,
    email,
    password,
    roleName: role.name,
  });

  return {
    adminId: admin._id,
    roleName: role.name,
    temporaryPassword: generated,
    emailSent: mail.sent,
    emailError: mail.error,
  };
};
