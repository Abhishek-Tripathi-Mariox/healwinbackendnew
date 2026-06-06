import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../../config";
import { Admin, AdminSession } from "../../models/admin.model";
import { Role, SIDEBAR_MODULES } from "../../models/role.model";

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

  res.locals.data = {
    admin: { ...admin.toObject(), permissions: effectivePermissions },
    accessibleModules,
  };
};

/**
 * Forgot Password
 */
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  const admin = await Admin.findOne({ email: email.toLowerCase() });

  if (!admin) {
    // Don't reveal if email exists
    res.locals.data = { message: "If email exists, reset link will be sent" };
    return;
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  admin.resetPasswordToken = resetTokenHash;
  admin.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
  await admin.save();

  // TODO: Send email with reset link
  // For now, just return success
  res.locals.data = {
    message: "If email exists, reset link will be sent",
    // Remove in production:
    resetToken,
  };
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

  res.locals.data = { message: "Password reset successful" };
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
