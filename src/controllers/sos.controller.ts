import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import * as SOSService from "../services/sos.service";
import { SOSSubmission } from "../models/sos-submission.model";
import User from "../models/Users";
import { emitToAdmin } from "../utils/socket.util";
import PatientFamilyMember from "../models/patient-family-member.model";
import { sendToUser } from "../services/notification.service";

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

    // "Who is this emergency for?" — the account holder, or one of their saved
    // family members. Scoped by userId so a caller cannot pass someone else's
    // familyMemberId and have the control room dispatch to a stranger.
    // This lookup is enrichment, never a gate: a bad id must degrade the alert
    // to "for the account holder", never reject the emergency. String() blocks
    // an object being smuggled into the query, and the isValidObjectId check
    // stops a malformed id throwing a CastError out of the whole handler.
    let subject: { name?: string; phone?: string; relation?: string } | null = null;
    const familyMemberId = req.body.familyMemberId
      ? String(req.body.familyMemberId)
      : "";
    if (familyMemberId && mongoose.isValidObjectId(familyMemberId)) {
      try {
        const member: any = await PatientFamilyMember.findOne({
          _id: familyMemberId,
          userId,
        })
          .select("name relation phone")
          .lean();
        if (member) {
          subject = {
            name: member.name,
            phone: member.phone,
            relation: member.relation,
          };
        }
      } catch {
        subject = null; // never let this block the dispatch
      }
    }
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
    const fullAddress = [
      type,
      address,
      description,
      // Make it unmistakable at the dispatch desk that the patient is not the
      // account holder — they are two different people to call.
      subject
        ? `For ${subject.name}${subject.relation ? ` (${subject.relation})` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" — ");

    /**
     * Does this go to the control room, or only to family?
     *
     * Default is YES — an SOS means an ambulance. A "family only" alert is a
     * deliberate, narrower thing: tell my son I need help, without dispatching
     * anyone. It is honoured, but nothing about it is inferred — the caller
     * has to ask for it explicitly, and the app spells out that no ambulance
     * will come.
     */
    const notifyControlRoom = req.body.notifyControlRoom !== false;

    // An SOS addressed to nobody is not an SOS. Refuse it rather than
    // returning success for an alert that reached no one.
    if (
      !notifyControlRoom &&
      (!Array.isArray(req.body.notifyFamilyMemberIds) ||
        req.body.notifyFamilyMemberIds.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Choose at least one person to alert, or let the control room be notified.",
      });
    }

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
    const patient: any = userId
      ? await User.findById(userId).select("fullName mobileNumber countryCode").lean().catch(() => null)
      : null;
    const hasCoords = coords.lat !== 0 || coords.lng !== 0;
    try {
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
        // The person who needs help. Falls back to the account holder when no
        // family member was chosen.
        name: subject?.name || req.body.name || patient?.fullName || "App SOS",
        phone: subject?.phone
          ? subject.phone
          : patient?.mobileNumber
          ? `${patient.countryCode || ""}${patient.mobileNumber}`
          : "N/A",
        address: fullAddress || address || undefined,
        controlRoomAlerted: notifyControlRoom,
        emergencyType,
        description: description || undefined,
        status: "PENDING",
        ...(hasCoords
          ? { location: { type: "Point", coordinates: [coords.lng, coords.lat] } }
          : {}),
      });
    } catch (e: any) {
      console.error("SOS dashboard/submission step failed (non-fatal):", e?.message);
    }

    // ── Alert the chosen family members ──────────────────────────────────
    //
    // The raiser picks who else should know: nobody, one person, or everyone
    // on the account. Reachability is recorded per person — a family member
    // with an app account gets a push; one without has no channel we can use
    // (the SMS gateway here is OTP-template only), and that is written down
    // rather than silently skipped, so the control room can phone them.
    const notifiedContacts: any[] = [];
    const requested: string[] = Array.isArray(req.body.notifyFamilyMemberIds)
      ? req.body.notifyFamilyMemberIds.map((x: any) => String(x))
      : [];
    if (userId && requested.length > 0) {
      const validIds = requested.filter((id) => mongoose.isValidObjectId(id));
      const members: any[] = validIds.length
        ? await PatientFamilyMember.find({
            _id: { $in: validIds },
            // Scoped to the raiser's own family — otherwise anyone could
            // blast an alert to arbitrary people by guessing ids.
            userId,
          })
            .select("name phone relation linkedUserId")
            .lean()
        : [];

      const who = subject?.name || patient?.fullName || "A family member";
      const where = fullAddress || address || "location unavailable";
      for (const m of members) {
        if (m.linkedUserId) {
          try {
            await sendToUser(
              m.linkedUserId,
              "SYSTEM",
              "🚨 Emergency SOS",
              `${who} has raised an emergency${type ? ` (${type})` : ""}. Location: ${where}`,
              { sosId: String(submission?._id || sosAlert._id), route: "Tracking" },
            );
            notifiedContacts.push({
              familyMemberId: m._id, name: m.name, phone: m.phone,
              relation: m.relation, channel: "push", delivered: true,
            });
          } catch (err: any) {
            notifiedContacts.push({
              familyMemberId: m._id, name: m.name, phone: m.phone,
              relation: m.relation, channel: "push", delivered: false,
              note: err?.message || "push failed",
            });
          }
        } else {
          notifiedContacts.push({
            familyMemberId: m._id, name: m.name, phone: m.phone,
            relation: m.relation, channel: "none", delivered: false,
            note: "No app account — the control room should call this person.",
          });
        }
      }

      if (submission && notifiedContacts.length) {
        await SOSSubmission.updateOne(
          { _id: submission._id },
          { $set: { notifiedContacts } },
        ).catch(() => undefined);
      }
    }

    // Alert the admin in real time — even if the submission save above failed —
    // so an SOS is never silently dropped from the dashboard alarm. Falls back
    // to the SOSAlert id when there's no submission.
    //
    // Skipped only for a family-only alert: raising the control-room alarm for
    // something the raiser deliberately kept private would dispatch an
    // ambulance nobody asked for.
    if (notifyControlRoom) {
    emitToAdmin("sos:new", {
      sosId: String(submission?._id || sosAlert._id),
      emergency: true,
      patientName: req.body.name || patient?.fullName || "A patient",
      address: fullAddress || address || "Location unavailable",
      lat: hasCoords ? coords.lat : undefined,
      lng: hasCoords ? coords.lng : undefined,
    });
    }

    const reached = notifiedContacts.filter((c) => c.delivered).length;
    const unreachable = notifiedContacts.filter((c) => !c.delivered);

    res.status(201).json({
      success: true,
      // Say exactly what happened. "Help is on the way" is false for a
      // family-only alert, and a patient believing an ambulance is coming when
      // none is, is the worst possible outcome here.
      message: notifyControlRoom
        ? "SOS alert triggered. Help is on the way."
        : reached > 0
          ? `Your family has been alerted. No ambulance has been dispatched.`
          : `Alert recorded, but nobody could be reached. Call for help directly.`,
      data: {
        sosId: sosAlert._id,
        submissionId: submission?._id,
        status: sosAlert.status,
        controlRoomAlerted: notifyControlRoom,
        familyAlerted: reached,
        // Named, so the app can tell the raiser who to phone themselves.
        unreachable: unreachable.map((c) => ({ name: c.name, phone: c.phone })),
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
