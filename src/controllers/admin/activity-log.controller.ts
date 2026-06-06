import { Request, Response } from "express";
import { AdminActivityLog } from "../../models/admin-activity-log.model";

export const getActivityLogs = async (req: Request, res: Response) => {
  const { staffId, module, timeRange, page, limit, dateFrom, dateTo } =
    req.query as {
      staffId?: string;
      module?: string;
      timeRange?: string;
      page?: string;
      limit?: string;
      dateFrom?: string;
      dateTo?: string;
    };

  const filter: Record<string, any> = {};
  if (staffId) filter.staffId = staffId;
  if (module) filter.module = module;

  // Time range filters
  if (timeRange) {
    const now = Date.now();
    const rangeMap: Record<string, number> = {
      "1min": 60 * 1000,
      "10min": 10 * 60 * 1000,
      "1hr": 60 * 60 * 1000,
      "6hr": 6 * 60 * 60 * 1000,
      "12hr": 12 * 60 * 60 * 1000,
      "24hr": 24 * 60 * 60 * 1000,
    };
    if (rangeMap[timeRange]) {
      filter.createdAt = { $gte: new Date(now - rangeMap[timeRange]) };
    }
  }

  if (dateFrom || dateTo) {
    filter.createdAt = filter.createdAt || {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const pageNum = parseInt(page || "1", 10);
  const limitNum = parseInt(limit || "50", 10);
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    AdminActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    AdminActivityLog.countDocuments(filter),
  ]);

  res.locals.data = {
    logs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

export const getStaffList = async (_req: Request, res: Response) => {
  const staff = await AdminActivityLog.aggregate([
    {
      $group: {
        _id: "$staffId",
        staffName: { $first: "$staffName" },
        staffEmail: { $first: "$staffEmail" },
        lastActivity: { $max: "$createdAt" },
        totalActions: { $sum: 1 },
      },
    },
    { $sort: { lastActivity: -1 } },
  ]);
  res.locals.data = staff;
};

export const getModuleList = async (_req: Request, res: Response) => {
  const modules = await AdminActivityLog.distinct("module");
  res.locals.data = modules.filter(Boolean).sort();
};
