import { Request, Response } from "express";
import { Types } from "mongoose";
import { SOSSubmission } from "../../models/sos-submission.model";
import { EmergencyDispatch } from "../../models/emergency-dispatch.model";
import Ambulance from "../../models/ambulance.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { sendPushNotification } from "../../services/notification.service";
import { emitToUser } from "../../utils/socket.util";
import { randomUUID } from "crypto";
import CallLog from "../../models/call-log.model";
import { Admin } from "../../models/admin.model";
import config from "../../config";
import { clickToCall, isConfigured, tenDigits, usesUserDial } from "../../services/myoperator.service";
import { escapeRegex } from "../../utils/helpers";

/**
 * Wraps up an SOS-linked dispatch when the admin resolves/closes the
 * SOS row. Marks the dispatch COMPLETED, frees the ambulance, and
 * notifies the on-vehicle crew so their app exits the active-dispatch
 * screen and the vehicle becomes dispatchable again.
 *
 * Best-effort — failures here must NOT block the SOS resolution
 * itself, since the SOS row update has already succeeded.
 */
const cascadeResolveDispatch = async (
  sosId: string,
  adminId: Types.ObjectId | string,
  resolutionNotes: string | undefined,
  req: Request,
): Promise<void> => {
  try {
    const dispatch = await EmergencyDispatch.findOne({
      sosSubmission: sosId,
      dispatchType: "AMBULANCE",
      status: { $nin: ["COMPLETED", "CANCELLED"] },
    });
    if (!dispatch) return;

    dispatch.status = "COMPLETED";
    dispatch.completedAt = new Date();
    if (resolutionNotes) {
      dispatch.responseNotes =
        `Resolved by admin: ${resolutionNotes}`.slice(0, 500);
    }
    await dispatch.save();

    // Free the ambulance for the next SOS — without this, the picker
    // continues to exclude it as on_dispatch.
    if (dispatch.ambulanceId) {
      await Ambulance.updateOne(
        { _id: dispatch.ambulanceId },
        { status: "available", currentDispatchId: null },
      );
    }

    // Push to driver + attendant so their active-dispatch screen
    // dismisses and the app returns to home. action="dispatch_resolved"
    // is what the Flutter side keys off.
    const data = {
      action: "dispatch_resolved",
      dispatchId: String(dispatch._id),
      sosId: String(sosId),
    };
    const [driver, attendant] = await Promise.all([
      dispatch.driverStaffId
        ? AmbulanceStaff.findById(dispatch.driverStaffId)
            .select("fcmToken")
            .lean()
        : null,
      dispatch.attendantStaffId
        ? AmbulanceStaff.findById(dispatch.attendantStaffId)
            .select("fcmToken")
            .lean()
        : null,
    ]);
    if (driver?.fcmToken) {
      sendPushNotification(
        driver.fcmToken,
        "Dispatch resolved",
        "The case has been closed by admin.",
        data,
      ).catch((e) => console.error("FCM driver resolved-push failed:", e));
    }
    if (attendant?.fcmToken) {
      sendPushNotification(
        attendant.fcmToken,
        "Dispatch resolved",
        "The case has been closed by admin.",
        data,
      ).catch((e) =>
        console.error("FCM attendant resolved-push failed:", e),
      );
    }
    if (dispatch.driverStaffId) {
      emitToUser(String(dispatch.driverStaffId), "dispatch:resolved", data);
    }
    if (dispatch.attendantStaffId) {
      emitToUser(
        String(dispatch.attendantStaffId),
        "dispatch:resolved",
        data,
      );
    }

    // Audit log line so ops can see which admin closed which dispatch.
    console.log(
      `[sos-resolve] dispatch ${dispatch._id} marked COMPLETED by admin ${adminId}; ambulance ${dispatch.ambulanceId} → available`,
    );
  } catch (err) {
    console.error("[sos-resolve] cascade failed:", err);
  }
  // Reference req so eslint doesn't complain — kept in the signature
  // for future use (e.g., per-request socket.io instance access).
  void req;
};

/**
 * Get all SOS submissions with filters (supports type tabs)
 */
export const getAllSubmissions = async (req: Request, res: Response) => {
  try {
    const {
      type,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      search,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const query: any = {};

    if (type) query.type = type;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { phone: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const [submissions, total] = await Promise.all([
      SOSSubmission.find(query)
        .populate("respondedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SOSSubmission.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        submissions,
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
      message: error.message || "Failed to fetch SOS submissions",
    });
  }
};

/**
 * Get SOS submission stats (counts by type & status)
 */
export const getSubmissionStats = async (req: Request, res: Response) => {
  try {
    const [typeCounts, statusCounts, todayCounts, typeStatusCounts] =
      await Promise.all([
      SOSSubmission.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      SOSSubmission.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      SOSSubmission.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      // Status counts broken down BY TYPE.
      //
      // `byStatus` above counts every submission regardless of type, but the
      // list on screen is always scoped to one tab. Without this split, the
      // dashboard's "Pending 3" card could open a list showing 1, because the
      // other two pending were forms rather than calls.
      SOSSubmission.aggregate([
        { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
      ]),
    ]);

    const TYPES = ["CALL", "FORM", "APP_DOWNLOAD"] as const;
    const STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
    const byTypeStatus = Object.fromEntries(
      TYPES.map((type) => [
        type,
        {
          ...Object.fromEntries(
            STATUSES.map((status) => [
              status,
              typeStatusCounts.find(
                (r: any) => r._id?.type === type && r._id?.status === status,
              )?.count || 0,
            ]),
          ),
          total: typeStatusCounts
            .filter((r: any) => r._id?.type === type)
            .reduce((sum: number, r: any) => sum + r.count, 0),
        },
      ]),
    );

    const stats = {
      byType: {
        CALL: typeCounts.find((t: any) => t._id === "CALL")?.count || 0,
        FORM: typeCounts.find((t: any) => t._id === "FORM")?.count || 0,
        APP_DOWNLOAD:
          typeCounts.find((t: any) => t._id === "APP_DOWNLOAD")?.count || 0,
      },
      byStatus: {
        PENDING: statusCounts.find((s: any) => s._id === "PENDING")?.count || 0,
        IN_PROGRESS:
          statusCounts.find((s: any) => s._id === "IN_PROGRESS")?.count || 0,
        RESOLVED:
          statusCounts.find((s: any) => s._id === "RESOLVED")?.count || 0,
        CLOSED: statusCounts.find((s: any) => s._id === "CLOSED")?.count || 0,
      },
      today: {
        CALL: todayCounts.find((t: any) => t._id === "CALL")?.count || 0,
        FORM: todayCounts.find((t: any) => t._id === "FORM")?.count || 0,
        APP_DOWNLOAD:
          todayCounts.find((t: any) => t._id === "APP_DOWNLOAD")?.count || 0,
      },
      byTypeStatus,
      total: typeCounts.reduce((sum: number, t: any) => sum + t.count, 0) || 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch SOS stats",
    });
  }
};

/**
 * Get single submission details
 */
export const getSubmissionDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as Record<string, string>;
    const submission = await SOSSubmission.findById(id).populate(
      "respondedBy",
      "name email",
    );

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "SOS submission not found",
      });
    }

    res.json({
      success: true,
      data: submission,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch submission details",
    });
  }
};

/**
 * One-click "Call" on an SOS submission.
 *
 * Places a MyOperator click-to-call: rings the admin who pressed the button
 * (on the mobile number in their profile, falling back to the control room),
 * then bridges them to the caller. The attempt is written to the call log, so
 * duration, outcome and the recording all land against it when MyOperator's
 * webhook reports back.
 */
export const callSubmitter = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as Record<string, string>;
    const submission = await SOSSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "SOS submission not found",
      });
    }
    const customerNumber = tenDigits(String(submission.phone || ""));
    if (!customerNumber || customerNumber.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "This submission has no valid phone number to call",
      });
    }
    if (!isConfigured()) {
      return res.status(400).json({
        success: false,
        message:
          "MyOperator is not configured — set MYOPERATOR_API_KEY, " +
          "MYOPERATOR_COMPANY_ID, MYOPERATOR_SECRET_TOKEN and MYOPERATOR_PUBLIC_IVR_ID in the backend .env",
      });
    }

    const adminId = (req as any).adminId || (req as any).admin?._id;
    let agentNumber = "";
    if (adminId) {
      const admin: any = await Admin.findById(adminId)
        .select("phone mobileNumber")
        .lean();
      agentNumber = tenDigits(String(admin?.phone || admin?.mobileNumber || ""));
    }
    if (!agentNumber) agentNumber = tenDigits(String(config.ivr.operatorNumber || ""));
    if (agentNumber.length !== 10 && !usesUserDial()) {
      return res.status(400).json({
        success: false,
        message:
          "No agent number to ring — add a mobile number to your admin profile, " +
          "or set IVR_OPERATOR_NUMBER for the control room",
      });
    }

    const refId = randomUUID();
    const result = await clickToCall(agentNumber, customerNumber, refId);

    // Logged either way: a failed bridge is exactly what someone needs to see.
    const call = await CallLog.create({
      provider: result.provider,
      providerCallId: result.callId,
      refId,
      direction: "click_to_call",
      status: result.status === "placed" ? "initiated" : "failed",
      customerNumber,
      agentNumber,
      placedByAdminId: adminId,
      subjectType: "sos_submission",
      subjectId: submission._id,
      subjectLabel: submission.name || `SOS ${customerNumber}`,
      notes: result.note,
      startedAt: new Date(),
    });

    if (result.status !== "placed") {
      return res.status(400).json({
        success: false,
        message: result.note || "The call could not be placed",
        data: { callId: String(call._id) },
      });
    }

    return res.json({
      success: true,
      data: { call, agentNumber },
      message: `Ringing ${agentNumber} — you will be connected to ${customerNumber}`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to place call",
    });
  }
};

/**
 * Update submission status (respond / resolve / close)
 */
export const updateSubmissionStatus = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { id } = req.params as Record<string, string>;
    const { status, resolutionNotes } = req.body;

    const validStatuses = ["IN_PROGRESS", "RESOLVED", "CLOSED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updateData: any = { status };
    if (status === "IN_PROGRESS") {
      updateData.respondedBy = adminId;
      updateData.respondedAt = new Date();
    }
    if (status === "RESOLVED" || status === "CLOSED") {
      updateData.resolvedAt = new Date();
      if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
    }

    const submission = await SOSSubmission.findByIdAndUpdate(id, updateData, {
      returnDocument: "after",
    }).populate("respondedBy", "name email");

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "SOS submission not found",
      });
    }

    // When the SOS itself is resolved/closed, cascade the resolution
    // down to any active dispatch row + free up the ambulance. Without
    // this, the dispatch stays open, the ambulance stays on_dispatch
    // (invisible to the picker for future SOSes), and the driver/
    // attendant app keeps showing the active-dispatch screen.
    if (status === "RESOLVED" || status === "CLOSED") {
      await cascadeResolveDispatch(id, adminId, resolutionNotes, req);
    }

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("sos:submission-updated", {
        submission,
      });
      // Public website caller watching this submission's live status.
      io.to(`sos-submission:${id}`).emit("sos:status", {
        submissionId: String(id),
        status,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `SOS submission ${status.toLowerCase().replace("_", " ")}`,
      data: submission,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update submission",
    });
  }
};

/**
 * Get submissions with location data (for map tracking)
 */
export const getSubmissionsWithLocation = async (
  req: Request,
  res: Response,
) => {
  try {
    const { type, status } = req.query;
    const query: any = {
      "location.coordinates": { $exists: true, $ne: null },
    };

    if (type) query.type = type;
    if (status) query.status = status;
    else query.status = { $in: ["PENDING", "IN_PROGRESS"] };

    const submissions = await SOSSubmission.find(query)
      .select("type name phone location address status emergencyType createdAt")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: submissions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch locations",
    });
  }
};
