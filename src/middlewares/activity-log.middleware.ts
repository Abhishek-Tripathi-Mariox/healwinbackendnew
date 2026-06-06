import { Request, Response, NextFunction } from "express";
import { AdminActivityLog } from "../models/admin-activity-log.model";

// Map route paths to module names
const getModule = (path: string): string => {
  const segments = path.replace("/v1/api/admin/", "").split("/");
  const first = segments[0] || "unknown";
  const moduleMap: Record<string, string> = {
    auth: "Auth",
    staff: "Staff",
    roles: "Roles",
    careers: "Careers",
    applications: "Applications",
    team: "Team",
    services: "Services",
    "service-categories": "Categories",
    states: "States",
    districts: "Districts",
    divisions: "Divisions",
    departments: "Departments",
    centres: "Centres",
    "locator-service-types": "Locator Types",
    cms: "CMS",
    "about-content": "About",
    "home-content": "Home",
    "contact-content": "Contact",
    "contact-messages": "Contact Messages",
    news: "News",
    gallery: "Gallery",
    "article-submissions": "Submissions",
    "sos-submissions": "SOS Submissions",
    dispatches: "Dispatches",
    sos: "SOS",
    "logo-settings": "Logo Settings",
    "activity-logs": "Activity Logs",
  };
  return moduleMap[first] || first;
};

const getAction = (method: string, path: string): string => {
  const meth = method.toUpperCase();
  if (meth === "GET") return "View";
  if (meth === "POST") return "Create";
  if (meth === "PUT" || meth === "PATCH") return "Update";
  if (meth === "DELETE") return "Delete";
  return meth;
};

// Sanitize request body - remove sensitive fields and large data
const sanitizeBody = (body: any): any => {
  if (!body || typeof body !== "object") return undefined;
  const sanitized = { ...body };
  const sensitiveKeys = ["password", "newPassword", "token", "otp"];
  for (const key of sensitiveKeys) {
    if (sanitized[key]) sanitized[key] = "***";
  }
  // Truncate large values
  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] === "string" && sanitized[key].length > 500) {
      sanitized[key] = sanitized[key].substring(0, 500) + "...";
    }
  }
  return sanitized;
};

const activityLogMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const startTime = Date.now();

  // Hook into response finish event — admin is checked lazily
  // (after verifyAdminToken has run and set it on the request)
  const originalEnd = res.end.bind(res);
  (res as any).end = function (this: Response, ...args: any[]) {
    const admin = (req as any).admin;
    // Only log if admin user is authenticated
    if (!admin) {
      return (originalEnd as Function).apply(res, args);
    }

    const timeTaken = Date.now() - startTime;
    const module = getModule(req.originalUrl || req.path);
    const action = getAction(req.method, req.originalUrl || req.path);

    // Skip logging activity-log fetches to avoid infinite loop
    if (req.method === "GET" && req.originalUrl.includes("/activity-logs")) {
      return (originalEnd as Function).apply(res, args);
    }

    // Log asynchronously - don't block the response
    AdminActivityLog.findOne({ staffId: admin._id })
      .sort({ createdAt: -1 })
      .then((prev) => {
        const timeSincePrevious = prev
          ? Date.now() - new Date(prev.createdAt).getTime()
          : undefined;

        AdminActivityLog.create({
          staffId: admin._id,
          staffName: admin.fullName || admin.name || "Unknown",
          staffEmail: admin.email || "Unknown",
          action,
          module,
          method: req.method,
          path: req.originalUrl || req.path,
          ip: req.ip || req.headers["x-forwarded-for"]?.toString(),
          userAgent: req.headers["user-agent"],
          requestBody:
            req.method !== "GET" ? sanitizeBody(req.body) : undefined,
          responseStatus: res.statusCode,
          timeTaken,
          previousAction: prev?._id,
          timeSincePrevious,
        }).catch((err) =>
          console.error("Failed to log admin activity:", err.message),
        );
      })
      .catch(() => {});

    return (originalEnd as Function).apply(res, args);
  };

  next();
};

export default activityLogMiddleware;
