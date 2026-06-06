import { Request, Response } from "express";
import { EmergencyDispatch } from "../../models/emergency-dispatch.model";
import { SOSSubmission } from "../../models/sos-submission.model";

/**
 * Create new emergency dispatch for an SOS submission
 * POST /admin/sos-submissions/:id/dispatch
 */
export const createDispatch = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { id } = req.params;
    const {
      dispatchType,
      serviceName,
      servicePhone,
      serviceAddress,
      serviceLocation,
      message,
      priority,
      estimatedArrival,
    } = req.body;

    // Validate SOS submission exists
    const submission = await SOSSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "SOS submission not found",
      });
    }

    if (!dispatchType || !serviceName || !servicePhone) {
      return res.status(400).json({
        success: false,
        message: "dispatchType, serviceName, and servicePhone are required",
      });
    }

    // Create dispatch
    const dispatch = await EmergencyDispatch.create({
      sosSubmission: id,
      dispatchType,
      serviceName,
      servicePhone,
      serviceAddress,
      serviceLocation,
      dispatchedBy: adminId,
      message,
      priority: priority || "HIGH",
      estimatedArrival,
      status: "DISPATCHED",
    });

    // Auto-update submission status to IN_PROGRESS if still PENDING
    if (submission.status === "PENDING") {
      submission.status = "IN_PROGRESS";
      submission.respondedBy = adminId;
      submission.respondedAt = new Date();
      await submission.save();
    }

    // Populate for response
    const populated = await EmergencyDispatch.findById(dispatch._id)
      .populate("dispatchedBy", "name email")
      .populate("sosSubmission", "type name phone location emergencyType");

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("sos:dispatch-created", {
        dispatch: populated,
        submissionId: id,
      });
    }

    res.status(201).json({
      success: true,
      message: `${dispatchType} dispatched to ${serviceName}`,
      data: populated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create dispatch",
    });
  }
};

/**
 * Get all dispatches for an SOS submission
 * GET /admin/sos-submissions/:id/dispatches
 */
export const getDispatchesForSubmission = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const dispatches = await EmergencyDispatch.find({ sosSubmission: id })
      .populate("dispatchedBy", "name email")
      .sort({ dispatchedAt: -1 });

    res.json({
      success: true,
      data: dispatches,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dispatches",
    });
  }
};

/**
 * Get all dispatches across all submissions (with filters)
 * GET /admin/dispatches
 */
export const getAllDispatches = async (req: Request, res: Response) => {
  try {
    const { dispatchType, status, priority, page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const query: any = {};

    if (dispatchType) query.dispatchType = dispatchType;
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const [dispatches, total] = await Promise.all([
      EmergencyDispatch.find(query)
        .populate("dispatchedBy", "name email")
        .populate(
          "sosSubmission",
          "type name phone location emergencyType address status",
        )
        .sort({ dispatchedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      EmergencyDispatch.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        dispatches,
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
      message: error.message || "Failed to fetch dispatches",
    });
  }
};

/**
 * Update a dispatch status
 * PUT /admin/dispatches/:dispatchId/status
 */
export const updateDispatchStatus = async (req: Request, res: Response) => {
  try {
    const { dispatchId } = req.params;
    const { status, responseNotes, cancelReason } = req.body;

    const validStatuses = [
      "ACKNOWLEDGED",
      "EN_ROUTE",
      "ON_SCENE",
      "COMPLETED",
      "CANCELLED",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updateData: any = { status };
    if (status === "ACKNOWLEDGED") updateData.acknowledgedAt = new Date();
    if (status === "EN_ROUTE" || status === "ON_SCENE")
      updateData.arrivedAt = new Date();
    if (status === "COMPLETED") {
      updateData.completedAt = new Date();
      if (responseNotes) updateData.responseNotes = responseNotes;
    }
    if (status === "CANCELLED") {
      updateData.cancelledAt = new Date();
      if (cancelReason) updateData.cancelReason = cancelReason;
    }

    const dispatch = await EmergencyDispatch.findByIdAndUpdate(
      dispatchId,
      updateData,
      {
        returnDocument: "after",
      },
    )
      .populate("dispatchedBy", "name email")
      .populate("sosSubmission", "type name phone location emergencyType");

    if (!dispatch) {
      return res.status(404).json({
        success: false,
        message: "Dispatch not found",
      });
    }

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("sos:dispatch-updated", { dispatch });
    }

    res.json({
      success: true,
      message: `Dispatch ${status.toLowerCase().replace("_", " ")}`,
      data: dispatch,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update dispatch",
    });
  }
};

/**
 * Get dispatch stats
 * GET /admin/dispatches/stats
 */
export const getDispatchStats = async (req: Request, res: Response) => {
  try {
    const [typeCounts, statusCounts] = await Promise.all([
      EmergencyDispatch.aggregate([
        { $group: { _id: "$dispatchType", count: { $sum: 1 } } },
      ]),
      EmergencyDispatch.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const stats = {
      byType: {
        AMBULANCE:
          typeCounts.find((t: any) => t._id === "AMBULANCE")?.count || 0,
        POLICE: typeCounts.find((t: any) => t._id === "POLICE")?.count || 0,
        FIRE_BRIGADE:
          typeCounts.find((t: any) => t._id === "FIRE_BRIGADE")?.count || 0,
        EMERGENCY_CENTER:
          typeCounts.find((t: any) => t._id === "EMERGENCY_CENTER")?.count || 0,
        RESCUE_TEAM:
          typeCounts.find((t: any) => t._id === "RESCUE_TEAM")?.count || 0,
      },
      byStatus: {
        DISPATCHED:
          statusCounts.find((s: any) => s._id === "DISPATCHED")?.count || 0,
        ACKNOWLEDGED:
          statusCounts.find((s: any) => s._id === "ACKNOWLEDGED")?.count || 0,
        EN_ROUTE:
          statusCounts.find((s: any) => s._id === "EN_ROUTE")?.count || 0,
        ON_SCENE:
          statusCounts.find((s: any) => s._id === "ON_SCENE")?.count || 0,
        COMPLETED:
          statusCounts.find((s: any) => s._id === "COMPLETED")?.count || 0,
        CANCELLED:
          statusCounts.find((s: any) => s._id === "CANCELLED")?.count || 0,
      },
      total: typeCounts.reduce((sum: number, t: any) => sum + t.count, 0) || 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dispatch stats",
    });
  }
};
