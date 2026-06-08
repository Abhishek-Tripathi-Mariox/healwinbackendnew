import { Request, Response } from "express";
import { Types } from "mongoose";
import * as SOSService from "../services/sos.service";
import { SOSSubmission } from "../models/sos-submission.model";
import User from "../models/Users";
import { emitToAdmin } from "../utils/socket.util";

/**
 * Get emergency contacts
 */
export const getEmergencyContacts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const contacts = await SOSService.getEmergencyContacts(userId);

    res.json({
      success: true,
      data: contacts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch emergency contacts",
    });
  }
};

/**
 * Add emergency contact
 */
export const addEmergencyContact = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { name, phone, relationship, isPrimary } = req.body;

    if (!name || !phone || !relationship) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, and relationship are required",
      });
    }

    const contact = await SOSService.addEmergencyContact(userId, {
      name,
      phone,
      relationship,
      isPrimary,
    });

    res.status(201).json({
      success: true,
      message: "Emergency contact added",
      data: contact,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add emergency contact",
    });
  }
};

/**
 * Update emergency contact
 */
export const updateEmergencyContact = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { contactId } = req.params as Record<string, string>;

    const contact = await SOSService.updateEmergencyContact(
      userId,
      new Types.ObjectId(contactId),
      req.body
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    res.json({
      success: true,
      message: "Emergency contact updated",
      data: contact,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update emergency contact",
    });
  }
};

/**
 * Delete emergency contact
 */
export const deleteEmergencyContact = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { contactId } = req.params as Record<string, string>;

    const deleted = await SOSService.deleteEmergencyContact(
      userId,
      new Types.ObjectId(contactId)
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    res.json({
      success: true,
      message: "Emergency contact deleted",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete emergency contact",
    });
  }
};

/**
 * Trigger SOS alert
 */
export const triggerSOS = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).userId;
    const { location, bookingId, address, type, description } = req.body;
    // 'CALL' → SOS Dashboard "SOS Calls" tab (one-tap SOS Call from the app,
    // mirrors a website phone call); anything else → "SOS Forms" tab.
    const submissionType =
      String(req.body.submissionType || "").toUpperCase() === "CALL"
        ? "CALL"
        : "FORM";

    // Location is best-effort: the patient app's SOS form may not capture GPS.
    // Fall back to (0,0) so the alert still reaches the admin dashboard with
    // the typed address/description for context.
    const coords =
      location && location.lat != null && location.lng != null
        ? location
        : { lat: 0, lng: 0 };

    // Fold the emergency type + description into the address text so the
    // dispatcher sees full context even without coordinates.
    const fullAddress = [type, address, description]
      .filter(Boolean)
      .join(" — ");

    const sosAlert = await SOSService.triggerSOS(
      "USER",
      userId,
      coords,
      bookingId ? new Types.ObjectId(bookingId) : undefined,
      fullAddress || address
    );

    // Also surface the SOS in the admin SOS Dashboard (SOSSubmission list) +
    // raise the realtime alarm. This is BEST-EFFORT: the core SOS alert above
    // already succeeded, so a failure here must never turn the request into a
    // 500 (the patient must always get "SOS sent").
    let submission: any = null;
    try {
      const patient: any = userId
        ? await User.findById(userId).select("fullName mobileNumber countryCode").lean()
        : null;
      const hasCoords = coords.lat !== 0 || coords.lng !== 0;
      // Map the app's free-text type to the SOSSubmission emergencyType enum.
      const ET: Record<string, string> = {
        "medical emergency": "MEDICAL",
        medical: "MEDICAL",
        accident: "ACCIDENT",
        fire: "FIRE",
        "natural disaster": "NATURAL_DISASTER",
        violence: "VIOLENCE",
        other: "OTHER",
      };
      const emergencyType = ET[String(type || "").toLowerCase()] || "OTHER";

      submission = await SOSSubmission.create({
        type: submissionType,
        userId: userId || undefined,
        name: req.body.name || patient?.fullName || "App SOS",
        phone: patient?.mobileNumber
          ? `${patient.countryCode || ""}${patient.mobileNumber}`
          : "N/A",
        address: fullAddress || address || undefined,
        emergencyType,
        description: description || undefined,
        status: "PENDING",
        ...(hasCoords
          ? { location: { type: "Point", coordinates: [coords.lng, coords.lat] } }
          : {}),
      });
      // Single realtime alert → admin alarm modal. (This is the ONLY sos:new
      // emit for an app SOS — SOSService no longer emits, and the SOS screen
      // doesn't create an AmbulanceRequest, so there's no duplicate.)
      emitToAdmin("sos:new", {
        sosId: String(submission._id),
        emergency: true,
        patientName: req.body.name || patient?.fullName || "A patient",
        address: fullAddress || address || "Location unavailable",
        lat: hasCoords ? coords.lat : undefined,
        lng: hasCoords ? coords.lng : undefined,
      });
    } catch (e: any) {
      console.error("SOS dashboard/submission step failed (non-fatal):", e?.message);
    }

    res.status(201).json({
      success: true,
      message: "SOS alert triggered. Help is on the way.",
      data: {
        sosId: sosAlert._id,
        submissionId: submission?._id,
        status: sosAlert.status,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to trigger SOS",
    });
  }
};

/**
 * Cancel SOS alert
 */
export const cancelSOS = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { sosId } = req.params as Record<string, string>;

    const sosAlert = await SOSService.cancelSOS(
      new Types.ObjectId(sosId),
      userId,
      "USER"
    );

    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: "SOS alert not found or already resolved",
      });
    }

    res.json({
      success: true,
      message: "SOS alert cancelled",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel SOS",
    });
  }
};

/**
 * Get SOS history
 */
export const getSOSHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { page = 1, limit = 20 } = req.query;

    const result = await SOSService.getSOSHistory(
      userId,
      "USER",
      Number(page),
      Number(limit)
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch SOS history",
    });
  }
};

/**
 * Share live location
 */
export const shareLiveLocation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { bookingId, duration } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
    }

    const result = await SOSService.shareLiveLocation(
      userId,
      new Types.ObjectId(bookingId),
      duration || 30
    );

    res.json({
      success: true,
      message: "Live location shared with emergency contacts",
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to share location",
    });
  }
};

// ===== Admin endpoints =====

/**
 * Get active SOS alerts (admin)
 */
export const getActiveSOSAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await SOSService.getActiveSOSAlerts();

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch SOS alerts",
    });
  }
};

/**
 * Get SOS details (admin)
 */
export const getSOSDetails = async (req: Request, res: Response) => {
  try {
    const { sosId } = req.params as Record<string, string>;

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
 * Respond to SOS (admin)
 */
export const respondToSOS = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { sosId } = req.params as Record<string, string>;

    const sosAlert = await SOSService.respondToSOS(
      new Types.ObjectId(sosId),
      adminId
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
 * Resolve SOS (admin)
 */
export const resolveSOS = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { sosId } = req.params as Record<string, string>;
    const { resolutionNotes, isFalseAlarm } = req.body;

    const sosAlert = await SOSService.resolveSOS(
      new Types.ObjectId(sosId),
      adminId,
      resolutionNotes || "",
      isFalseAlarm
    );

    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: "SOS alert not found",
      });
    }

    res.json({
      success: true,
      message: "SOS resolved",
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
 * Notify police (admin)
 */
export const notifyPolice = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { sosId } = req.params as Record<string, string>;

    const sosAlert = await SOSService.notifyPolice(
      new Types.ObjectId(sosId),
      adminId
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
