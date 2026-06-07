import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Admin } from "../../models/admin.model";
import {
  Role,
  PERMISSIONS,
  PERMISSION_GROUPS,
  SIDEBAR_MODULES,
  DEFAULT_ROLES,
} from "../../models/role.model";

// ==================== STAFF MANAGEMENT ====================

/**
 * Get all staff members
 */
export const getAllStaff = async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search,
    roleId,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query: any = { isDeleted: false };

  // Search by name, email, or phone
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by role
  if (roleId) {
    query.roleId = roleId;
  }

  // Filter by status
  if (status === "active") {
    query.isActive = true;
  } else if (status === "inactive") {
    query.isActive = false;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const [staff, total] = await Promise.all([
    Admin.find(query)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .populate("roleId", "name description permissions")
      .populate("createdBy", "fullName email")
      .sort({ [sortBy as string]: sortDirection })
      .skip(skip)
      .limit(Number(limit)),
    Admin.countDocuments(query),
  ]);

  res.locals.data = {
    staff,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * Get staff member by ID
 */
export const getStaffById = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;

  const staff = await Admin.findOne({ _id: id, isDeleted: false })
    .select("-password -resetPasswordToken -resetPasswordExpires")
    .populate("roleId", "name description permissions")
    .populate("createdBy", "fullName email");

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found",
    });
  }

  res.locals.data = { staff };
};

/**
 * Create new staff member
 */
export const createStaff = async (req: Request, res: Response) => {
  const { fullName, email, password, phone, roleId, customPermissions, doctorProfile } =
    req.body;

  // Validate required fields
  if (!fullName || !email || !password || !roleId) {
    return res.status(400).json({
      success: false,
      message: "Full name, email, password, and role are required",
    });
  }

  // Check if email already exists
  const existingStaff = await Admin.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  });

  if (existingStaff) {
    return res.status(400).json({
      success: false,
      message: "Email already in use",
    });
  }

  // Verify role exists
  const role = await Role.findOne({ _id: roleId, isActive: true });
  if (!role) {
    return res.status(400).json({
      success: false,
      message: "Invalid role",
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Combine role permissions with custom permissions
  const allPermissions = [
    ...new Set([...role.permissions, ...(customPermissions || [])]),
  ];

  const newStaff = await Admin.create({
    fullName,
    email: email.toLowerCase(),
    password: hashedPassword,
    phone,
    roleId: role._id,
    roleName: role.name,
    permissions: allPermissions,
    customPermissions: customPermissions || [],
    // Doctor display profile (only meaningful for the Doctor role).
    ...(role.name === "Doctor" && doctorProfile ? { doctorProfile } : {}),
    createdBy: req.adminId,
  });

  const staffData = await Admin.findById(newStaff._id)
    .select("-password -resetPasswordToken -resetPasswordExpires")
    .populate("roleId", "name description permissions");

  res.locals.data = {
    message: "Staff member created successfully",
    staff: staffData,
  };
};

/**
 * Update staff member
 */
export const updateStaff = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const { fullName, email, phone, roleId, customPermissions, profileImage, doctorProfile } =
    req.body;

  const staff = await Admin.findOne({ _id: id, isDeleted: false });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found",
    });
  }

  // Prevent modifying super admin by non-super admin
  if (
    staff.roleName === "Super Admin" &&
    req.admin?.roleName !== "Super Admin"
  ) {
    return res.status(403).json({
      success: false,
      message: "Cannot modify super admin account",
    });
  }

  // Check email uniqueness if changed
  if (email && email.toLowerCase() !== staff.email) {
    const existingStaff = await Admin.findOne({
      email: email.toLowerCase(),
      isDeleted: false,
      _id: { $ne: id },
    });

    if (existingStaff) {
      return res.status(400).json({
        success: false,
        message: "Email already in use",
      });
    }
  }

  const updateData: any = {};

  if (fullName) updateData.fullName = fullName;
  if (email) updateData.email = email.toLowerCase();
  if (phone !== undefined) updateData.phone = phone;
  if (profileImage !== undefined) updateData.profileImage = profileImage;
  if (doctorProfile !== undefined) updateData.doctorProfile = doctorProfile;

  // Update role if provided
  if (roleId) {
    const role = await Role.findOne({ _id: roleId, isActive: true });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    updateData.roleId = role._id;
    updateData.roleName = role.name;

    // Update permissions based on new role
    const allPermissions = [
      ...new Set([
        ...role.permissions,
        ...(customPermissions || staff.customPermissions || []),
      ]),
    ];
    updateData.permissions = allPermissions;
  }

  // Update custom permissions if provided
  if (customPermissions !== undefined) {
    updateData.customPermissions = customPermissions;

    // Recalculate total permissions
    const role = await Role.findById(roleId || staff.roleId);
    if (role) {
      updateData.permissions = [
        ...new Set([...role.permissions, ...customPermissions]),
      ];
    }
  }

  const updatedStaff = await Admin.findByIdAndUpdate(id, updateData, {
    returnDocument: "after",
  })
    .select("-password -resetPasswordToken -resetPasswordExpires")
    .populate("roleId", "name description permissions");

  res.locals.data = {
    message: "Staff member updated successfully",
    staff: updatedStaff,
  };
};

/**
 * Delete staff member (soft delete)
 */
export const deleteStaff = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;

  const staff = await Admin.findOne({ _id: id, isDeleted: false });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found",
    });
  }

  // Prevent deleting super admin
  if (staff.roleName === "Super Admin") {
    return res.status(403).json({
      success: false,
      message: "Cannot delete super admin account",
    });
  }

  // Prevent deleting self
  if (staff._id.toString() === req.adminId) {
    return res.status(403).json({
      success: false,
      message: "Cannot delete your own account",
    });
  }

  await Admin.findByIdAndUpdate(id, { isDeleted: true, isActive: false });

  res.locals.data = {
    message: "Staff member deleted successfully",
  };
};

/**
 * Toggle staff status (activate/deactivate)
 */
export const toggleStaffStatus = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;

  const staff = await Admin.findOne({ _id: id, isDeleted: false });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found",
    });
  }

  // Prevent deactivating super admin
  if (staff.roleName === "Super Admin" && staff.isActive) {
    return res.status(403).json({
      success: false,
      message: "Cannot deactivate super admin account",
    });
  }

  // Prevent deactivating self
  if (staff._id.toString() === req.adminId && staff.isActive) {
    return res.status(403).json({
      success: false,
      message: "Cannot deactivate your own account",
    });
  }

  const updatedStaff = await Admin.findByIdAndUpdate(
    id,
    { isActive: !staff.isActive },
    { returnDocument: "after" },
  ).select("-password -resetPasswordToken -resetPasswordExpires");

  res.locals.data = {
    message: `Staff member ${updatedStaff?.isActive ? "activated" : "deactivated"} successfully`,
    staff: updatedStaff,
  };
};

/**
 * Reset staff password
 */
export const resetStaffPassword = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters",
    });
  }

  const staff = await Admin.findOne({ _id: id, isDeleted: false });

  if (!staff) {
    return res.status(404).json({
      success: false,
      message: "Staff member not found",
    });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await Admin.findByIdAndUpdate(id, {
    password: hashedPassword,
    passwordChangedAt: new Date(),
  });

  res.locals.data = {
    message: "Password reset successfully",
  };
};

// ==================== ROLE MANAGEMENT ====================

/**
 * Get all roles
 */
export const getAllRoles = async (req: Request, res: Response) => {
  const roles = await Role.find({ isActive: true })
    .populate("createdBy", "fullName email")
    .sort({ isSystem: -1, name: 1 });

  // Add staff count for each role
  const rolesWithCount = await Promise.all(
    roles.map(async (role) => {
      const staffCount = await Admin.countDocuments({
        roleId: role._id,
        isDeleted: false,
      });
      return {
        ...role.toObject(),
        staffCount,
      };
    }),
  );

  res.locals.data = { roles: rolesWithCount };
};

/**
 * Get role by ID
 */
export const getRoleById = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;

  const role = await Role.findById(id).populate("createdBy", "fullName email");

  if (!role) {
    return res.status(404).json({
      success: false,
      message: "Role not found",
    });
  }

  const staffCount = await Admin.countDocuments({
    roleId: role._id,
    isDeleted: false,
  });

  res.locals.data = {
    role: {
      ...role.toObject(),
      staffCount,
    },
  };
};

/**
 * Create new role
 */
export const createRole = async (req: Request, res: Response) => {
  const { name, description, permissions } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Role name is required",
    });
  }

  // Check if role name already exists
  const existingRole = await Role.findOne({
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });

  if (existingRole) {
    return res.status(400).json({
      success: false,
      message: "Role name already exists",
    });
  }

  // Validate permissions
  const validPermissions = Object.values(PERMISSIONS);
  const invalidPermissions = (permissions || []).filter(
    (p: string) => !validPermissions.includes(p as any),
  );

  if (invalidPermissions.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid permissions: ${invalidPermissions.join(", ")}`,
    });
  }

  const newRole = await Role.create({
    name,
    description,
    permissions: permissions || [],
    isSystem: false,
    createdBy: req.adminId,
  });

  res.locals.data = {
    message: "Role created successfully",
    role: newRole,
  };
};

/**
 * Update role
 */
export const updateRole = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const { name, description, permissions } = req.body;

  const role = await Role.findById(id);

  if (!role) {
    return res.status(404).json({
      success: false,
      message: "Role not found",
    });
  }

  // Prevent modifying system role name
  if (role.isSystem && name && name !== role.name) {
    return res.status(403).json({
      success: false,
      message: "Cannot change system role name",
    });
  }

  // Check name uniqueness
  if (name && name !== role.name) {
    const existingRole = await Role.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: id },
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Role name already exists",
      });
    }
  }

  // Validate permissions
  if (permissions) {
    const validPermissions = Object.values(PERMISSIONS);
    const invalidPermissions = permissions.filter(
      (p: string) => !validPermissions.includes(p as any),
    );

    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid permissions: ${invalidPermissions.join(", ")}`,
      });
    }
  }

  const updateData: any = { updatedBy: req.adminId };
  if (name && !role.isSystem) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (permissions) updateData.permissions = permissions;

  const updatedRole = await Role.findByIdAndUpdate(id, updateData, {
    returnDocument: "after",
  });

  // Update permissions for all staff with this role
  if (permissions) {
    const staffWithRole = await Admin.find({ roleId: id, isDeleted: false });

    for (const staff of staffWithRole) {
      const allPermissions = [
        ...new Set([...permissions, ...(staff.customPermissions || [])]),
      ];
      await Admin.findByIdAndUpdate(staff._id, { permissions: allPermissions });
    }
  }

  res.locals.data = {
    message: "Role updated successfully",
    role: updatedRole,
  };
};

/**
 * Delete role
 */
export const deleteRole = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;

  const role = await Role.findById(id);

  if (!role) {
    return res.status(404).json({
      success: false,
      message: "Role not found",
    });
  }

  if (role.isSystem) {
    return res.status(403).json({
      success: false,
      message: "Cannot delete system role",
    });
  }

  // Check if any staff are using this role
  const staffCount = await Admin.countDocuments({
    roleId: id,
    isDeleted: false,
  });

  if (staffCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete role. ${staffCount} staff member(s) are using this role.`,
    });
  }

  await Role.findByIdAndUpdate(id, { isActive: false });

  res.locals.data = {
    message: "Role deleted successfully",
  };
};

/**
 * Get all available permissions
 */
export const getAllPermissions = async (_req: Request, res: Response) => {
  res.locals.data = {
    permissions: PERMISSIONS,
    groups: PERMISSION_GROUPS,
    sidebarModules: SIDEBAR_MODULES,
  };
};

/**
 * Initialize default roles (for setup)
 */
export const initializeDefaultRoles = async (_req: Request, res: Response) => {
  const createdRoles = [];

  for (const [key, roleData] of Object.entries(DEFAULT_ROLES)) {
    const existingRole = await Role.findOne({ name: roleData.name });

    if (!existingRole) {
      const newRole = await Role.create(roleData);
      createdRoles.push(newRole);
    }
  }

  res.locals.data = {
    message: `${createdRoles.length} default roles created`,
    roles: createdRoles,
  };
};

/**
 * Get sidebar modules for current user
 */
export const getSidebarModules = async (req: Request, res: Response) => {
  const admin = req.admin;

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  // Super admin gets all modules
  if (admin.roleName === "Super Admin") {
    res.locals.data = {
      modules: Object.keys(SIDEBAR_MODULES),
    };
    return;
  }

  // Filter modules based on permissions
  const accessibleModules = Object.entries(SIDEBAR_MODULES)
    .filter(([_, requiredPermissions]) =>
      requiredPermissions.some((p) => admin.permissions.includes(p)),
    )
    .map(([module]) => module);

  res.locals.data = {
    modules: accessibleModules,
  };
};
