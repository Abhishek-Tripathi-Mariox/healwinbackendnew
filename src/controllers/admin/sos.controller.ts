import { Request, Response } from "express";
import { Types } from "mongoose";
import { SOSAlert } from "../../models/sos.model";
import * as SOSService from "../../services/sos.service";

/**
 * Get all SOS alerts with filters
 */
export const getAllSOSAlerts = async (req: Request, res: Response) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = {};
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const [alerts, total] = await Promise.all([
      SOSAlert.find(query)
        .populate("userId", "name mobileNumber")
        .populate("driverId", "name mobileNumber")
        .populate("bookingId", "bookingNumber")
        .populate("respondedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SOSAlert.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch SOS alerts",
    });
  }
};

/**
 * Get active SOS alerts (for dashboard)
 */
export const getActiveSOSAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await SOSService.getActiveSOSAlerts();

    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch active SOS alerts",
    });
  }
};

/**
 * Get SOS alert details
 */
export const getSOSDetails = async (req: Request, res: Response) => {
  try {
    const { sosId } = req.params;

    const sosAlert = await SOSService.getSOSById(new Types.ObjectId(sosId));

    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: "SOS alert not found",
      });
    }

    res.json({
      success: true,
      data: sosAlert,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch SOS details",
    });
  }
};

/**
 * Respond to SOS
 */
export const respondToSOS = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { sosId } = req.params;

    const sosAlert = await SOSService.respondToSOS(
      new Types.ObjectId(sosId),
      adminId,
    );

    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: "SOS alert not found",
      });
    }

    res.json({
      success: true,
      message: "Response recorded",
      data: sosAlert,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to respond to SOS",
    });
  }
};

/**
 * Resolve SOS
 */
export const resolveSOS = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { sosId } = req.params;
    const { resolutionNotes, isFalseAlarm } = req.body;

    const sosAlert = await SOSService.resolveSOS(
      new Types.ObjectId(sosId),
      adminId,
      resolutionNotes || "",
      isFalseAlarm || false,
    );

    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: "SOS alert not found",
      });
    }

    res.json({
      success: true,
      message: isFalseAlarm ? "Marked as false alarm" : "SOS resolved",
      data: sosAlert,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to resolve SOS",
    });
  }
};

/**
 * Notify police
 */
export const notifyPolice = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { sosId } = req.params;

    const sosAlert = await SOSService.notifyPolice(
      new Types.ObjectId(sosId),
      adminId,
    );

    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: "SOS alert not found",
      });
    }

    res.json({
      success: true,
      message: "Police notified",
      data: sosAlert,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to notify police",
    });
  }
};

/**
 * Get SOS stats
 */
export const getSOSStats = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    const [
      activeCount,
      todayCount,
      thisMonthCount,
      lastMonthCount,
      resolvedCount,
      falseAlarmCount,
    ] = await Promise.all([
      SOSAlert.countDocuments({ status: "ACTIVE" }),
      SOSAlert.countDocuments({ createdAt: { $gte: today } }),
      SOSAlert.countDocuments({ createdAt: { $gte: thisMonth } }),
      SOSAlert.countDocuments({
        createdAt: { $gte: lastMonth, $lte: lastMonthEnd },
      }),
      SOSAlert.countDocuments({ status: "RESOLVED" }),
      SOSAlert.countDocuments({ status: "FALSE_ALARM" }),
    ]);

    res.json({
      success: true,
      data: {
        activeCount,
        todayCount,
        thisMonthCount,
        lastMonthCount,
        resolvedCount,
        falseAlarmCount,
        totalCount: resolvedCount + falseAlarmCount + activeCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get SOS stats",
    });
  }
};
