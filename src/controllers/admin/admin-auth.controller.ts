import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../../config";
import { Admin, AdminSession } from "../../models/admin.model";
import { Role, SIDEBAR_MODULES } from "../../models/role.model";
import HrEmployee from "../../models/hr-employee.model";
import {
  sendPasswordReset,
  sendPasswordChanged,
} from "../../services/account-email.service";

/**
 * Admin Login
 */
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  const admin = await Admin.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  })
    .select("+password")
    .populate("roleId", "name permissions");

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  if (!admin.isActive) {
    return res.status(401).json({
      success: false,
      message: "Account is deactivated",
    });
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password);

  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  // Generate token
  const token = jwt.sign(
    { adminId: admin._id, roleId: admin.roleId, roleName: admin.roleName },
    config.auth.jwtSecret,
    { expiresIn: "7d" },
  );

  // Create session
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await AdminSession.create({
    adminId: admin._id,
    token,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    expiresAt,
  });

  // Update last login
  await Admin.findByIdAndUpdate(admin._id, { lastLogin: new Date() });

  // Derive permissions from the role (source of truth) + any custom grants, so
  // newly-added module permissions take effect on next login without having to
  // rewrite each admin's cached permissions array.
  const roleDoc = admin.roleId as any;
  const rolePermissions: string[] = roleDoc?.permissions || [];
  const effectivePermissions = [
    ...new Set<string>([...rolePermissions, ...(admin.customPermissions || [])]),
  ];

  // Calculate accessible sidebar modules
  const accessibleModules =
    admin.roleName === "Super Admin"
      ? Object.keys(SIDEBAR_MODULES)
      : Object.entries(SIDEBAR_MODULES)
          .filter(([_, requiredPermissions]) =>
            requiredPermissions.some((p) => effectivePermissions.includes(p)),
          )
          .map(([module]) => module);

  res.locals.data = {
    token,
    admin: {
      _id: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      phone: admin.phone,
      profileImage: admin.profileImage,
      roleId: admin.roleId,
      roleName: admin.roleName,
      permissions: effectivePermissions,
    },
    accessibleModules,
  };
};

/**
 * Get Admin Profile
 */
export const getProfile = async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.adminId)
    .select("-password")
    .populate("roleId", "name description permissions");

  if (!admin) {
    return res.status(404).json({
      success: false,
      message: "Admin not found",
    });
  }

  // Fresh permissions from the role (source of truth) + custom grants.
  const roleDoc = admin.roleId as any;
  const rolePermissions: string[] = roleDoc?.permissions || [];
  const effectivePermissions = [
    ...new Set<string>([...rolePermissions, ...(admin.customPermissions || [])]),
  ];

  // Calculate accessible sidebar modules
  const accessibleModules =
    admin.roleName === "Super Admin"
      ? Object.keys(SIDEBAR_MODULES)
      : Object.entries(SIDEBAR_MODULES)
          .filter(([_, requiredPermissions]) =>
            requiredPermissions.some((p) => effectivePermissions.includes(p)),
          )
          .map(([module]) => module);

  // The HR record behind this login, when there is one, so the profile screen
  // can show who HR thinks this person is rather than only their login.
  const employee = await HrEmployee.findOne({
    linkedAdminId: admin._id,
    isDeleted: false,
  })
    .select("employeeCode departmentId designationId")
    .populate("departmentId", "name")
    .populate("designationId", "name")
    .lean();

  res.locals.data = {
    admin: {
      ...admin.toObject(),
      permissions: effectivePermissions,
      ...(employee
        ? {
            employee: {
              employeeCode: (employee as any).employeeCode,
              department: (employee as any).departmentId?.name,
              designation: (employee as any).designationId?.name,
            },
          }
        : {}),
    },
    accessibleModules,
  };
};

/**
 * Forgot Password
 */
/** How long a reset link stays usable. */
const RESET_TTL_MINUTES = 60;

/**
 * POST /admin/auth/forgot-password — email a one-time reset link.
 *
 * This route is public, and it used to RETURN the reset token in its own
 * response ("remove in production"). That made it an account takeover: anyone
 * who knew an administrator's email could ask for a token, read it straight
 * back, and set a new password without ever touching that person's mailbox.
 * The token now only ever leaves here inside an email to the address that owns
 * the account.
 *
 * The reply is deliberately identical whether or not the address exists —
 * otherwise this becomes a way to discover who has an account.
 */
export const forgotPassword = async (req: Request, res: Response) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const sameAnswer = {
    message:
      "If that email belongs to an account, a reset link is on its way. It expires in an hour.",
  };

  if (!email) {
    res.locals.data = sameAnswer;
    return;
  }

  const admin = await Admin.findOne({ email, isDeleted: { $ne: true } });
  if (!admin || admin.isActive === false) {
    res.locals.data = sameAnswer;
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  admin.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  admin.resetPasswordExpires = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
  await admin.save();

  const result = await sendPasswordReset({
    fullName: admin.fullName,
    email: admin.email,
    token: resetToken,
    expiresInMinutes: RESET_TTL_MINUTES,
  });

  // A token nobody can receive is worse than none: it sits valid for an hour
  // while the person waits for an email that never comes. Clear it and say so
  // in the log — the reply to the caller stays the same either way, so this
  // cannot be used to probe for accounts.
  if (!result.sent) {
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();
    console.error(
      `[auth] password reset email failed for ${admin.email}: ${result.error}`,
    );
  }

  res.locals.data = sameAnswer;
};

/**
 * Reset Password
 */
export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Token and new password are required",
    });
  }

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const admin = await Admin.findOne({
    resetPasswordToken: resetTokenHash,
    resetPasswordExpires: { $gt: new Date() },
  });

  if (!admin) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired reset token",
    });
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  admin.password = hashedPassword;
  admin.resetPasswordToken = undefined;
  admin.resetPasswordExpires = undefined;
  admin.passwordChangedAt = new Date();
  await admin.save();

  // Invalidate all sessions
  await AdminSession.updateMany({ adminId: admin._id }, { isActive: false });

  // Told after the fact, so a reset the owner did not ask for is noticed
  // rather than discovered the next time they cannot sign in.
  void sendPasswordChanged({ fullName: admin.fullName, email: admin.email });

  res.locals.data = { message: "Password reset successful" };
};

/**
 * PUT /admin/auth/me/password — change your own password.
 *
 * The current password is required: a stolen session should not be enough to
 * take the account permanently, which is exactly what changing the password
 * without proving you know it would allow.
 */
export const changeMyPassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Enter your current password and the new one.",
    });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({
      success: false,
      message: "The new password must be at least 8 characters.",
    });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: "The new password must be different from the current one.",
    });
  }

  // `password` is select:false on the schema, so it has to be asked for.
  const admin = await Admin.findById(req.adminId).select("+password");
  if (!admin) {
    return res.status(404).json({ success: false, message: "Account not found" });
  }

  const matches = await bcrypt.compare(String(currentPassword), admin.password);
  if (!matches) {
    return res.status(400).json({
      success: false,
      message: "Your current password is not correct.",
    });
  }

  admin.password = await bcrypt.hash(String(newPassword), 12);
  admin.passwordChangedAt = new Date();
  await admin.save();

  /**
   * Every other session is signed out, but not this one.
   *
   * Changing a password is what someone does when they think it may be known
   * to another person — leaving those sessions alive defeats the point. Being
   * kicked out of the tab you just used, though, reads as a failure.
   */
  // `$ne: undefined` would match every session, including this one — so the
  // filter is only added when the middleware actually provided a token.
  const ownToken = (req as any).sessionToken as string | undefined;
  await AdminSession.updateMany(
    {
      adminId: admin._id,
      ...(ownToken ? { token: { $ne: ownToken } } : {}),
    },
    { isActive: false },
  );

  void sendPasswordChanged({ fullName: admin.fullName, email: admin.email });

  res.locals.data = {
    message: "Password changed. Your other sessions have been signed out.",
  };
};

/**
 * Logout
 */
export const logout = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (token) {
    await AdminSession.findOneAndUpdate({ token }, { isActive: false });
  }

  res.locals.data = { message: "Logged out successfully" };
};

/**
 * Create Admin (Super Admin only)
 */
export const createAdmin = async (req: Request, res: Response) => {
  const { fullName, email, password, roleId, customPermissions, phone } =
    req.body;

  // Check if email exists
  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Email already exists",
    });
  }

  // Validate role exists
  const role = await Role.findById(roleId);
  if (!role) {
    return res.status(400).json({
      success: false,
      message: "Invalid role ID",
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Compute permissions
  const rolePermissions = role.permissions || [];
  const additionalPermissions = customPermissions || [];
  const allPermissions = [
    ...new Set([...rolePermissions, ...additionalPermissions]),
  ];

  const admin = await Admin.create({
    fullName,
    email: email.toLowerCase(),
    password: hashedPassword,
    roleId: role._id,
    roleName: role.name,
    permissions: allPermissions,
    customPermissions: additionalPermissions,
    phone,
    createdBy: req.adminId,
  });

  res.locals.data = {
    admin: {
      _id: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      roleName: admin.roleName,
      permissions: admin.permissions,
    },
  };
};
