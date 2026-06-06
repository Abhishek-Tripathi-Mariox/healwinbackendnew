import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import { Admin, AdminSession } from "../models/admin.model";
import { Role } from "../models/role.model";

interface AdminTokenPayload {
  adminId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: any;
      adminId?: string;
    }
  }
}

const AdminAuthMiddleware = () => {
  const verifyAdminToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Authorization token required",
        });
      }

      const token = authHeader.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(
        token,
        config.auth.jwtSecret,
      ) as AdminTokenPayload;

      // Check if session is valid
      const session = await AdminSession.findOne({
        adminId: decoded.adminId,
        token,
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          message: "Session expired or invalid",
        });
      }

      // Get admin details with role populated
      const admin = await Admin.findOne({
        _id: decoded.adminId,
        isActive: true,
        isDeleted: false,
      }).populate("roleId");

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: "Admin not found or inactive",
        });
      }

      // Compute permissions from role + custom permissions
      const roleDoc = admin.roleId as any;
      const rolePermissions = roleDoc?.permissions || [];
      const customPermissions = admin.customPermissions || [];
      const allPermissions = [
        ...new Set([...rolePermissions, ...customPermissions]),
      ];

      // Attach admin with computed permissions to request
      req.admin = {
        ...admin.toObject(),
        roleName: roleDoc?.name || admin.roleName,
        permissions: allPermissions,
      };
      req.adminId = admin._id.toString();

      next();
    } catch (error: any) {
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
        });
      }
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired",
        });
      }
      return res.status(500).json({
        success: false,
        message: "Authentication error",
      });
    }
  };

  const requireRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!roles.includes(req.admin.role)) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
        });
      }

      next();
    };
  };

  const requirePermission = (...permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // Super admin has all permissions
      if (
        req.admin.roleName === "Super Admin" ||
        req.admin.role === "SUPER_ADMIN"
      ) {
        return next();
      }

      // Check admin's permissions array
      const adminPermissions = req.admin.permissions || [];
      const hasPermission = permissions.some((p) =>
        adminPermissions.includes(p),
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
        });
      }

      next();
    };
  };

  return { verifyAdminToken, requireRole, requirePermission };
};

export default AdminAuthMiddleware;
