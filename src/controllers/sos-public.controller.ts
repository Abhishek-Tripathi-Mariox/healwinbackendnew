import { Request, Response } from "express";
import { SOSSubmission } from "../models/sos-submission.model";
import { emitToAdmin } from "../utils/socket.util";

/** Raise the admin alarm modal for a website/public SOS submission. */
const alertAdmin = (submission: any) => {
  // location.coordinates is GeoJSON [lng, lat]. The website SOS Call sends
  // coords but no address text, so surface the coords (and a readable label)
  // — otherwise the admin popup showed "Location unavailable" despite having
  // a real position, and dispatch had nothing to work with.
  const coords = submission.location?.coordinates;
  const lat = Array.isArray(coords) ? coords[1] : undefined;
  const lng = Array.isArray(coords) ? coords[0] : undefined;
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  emitToAdmin("sos:new", {
    sosId: String(submission._id),
    emergency: true,
    patientName: submission.name || "A caller",
    address:
      submission.address ||
      (hasCoords ? `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})` : "Location unavailable"),
    lat: hasCoords ? lat : undefined,
    lng: hasCoords ? lng : undefined,
  });
};

/**
 * Submit SOS Call record (public - no auth required)
 * Records that someone initiated an SOS call
 */
export const submitSOSCall = async (req: Request, res: Response) => {
  try {
    // Handle text/plain body from sendBeacon (parse JSON string)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const { name, phone, latitude, longitude, address } = body;

    const submission = await SOSSubmission.create({
      type: "CALL",
      name: name || "Anonymous Caller",
      phone: phone || "N/A",
      location:
        latitude && longitude
          ? {
              type: "Point",
              coordinates: [longitude, latitude],
            }
          : undefined,
      address,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Emit socket event for real-time admin notification
    alertAdmin(submission);

    res.status(201).json({
      success: true,
      message: "SOS call recorded successfully",
      data: { id: submission._id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record SOS call",
    });
  }
};

/**
 * Submit SOS Form (public - no auth required)
 * Full emergency form submission
 */
export const submitSOSForm = async (req: Request, res: Response) => {
  try {
    const {
      name,
      phone,
      email,
      emergencyType,
      description,
      numberOfPeople,
      latitude,
      longitude,
      address,
    } = req.body;

    if (!name || !phone || !emergencyType) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, and emergency type are required",
      });
    }

    const submission = await SOSSubmission.create({
      type: "FORM",
      name,
      phone,
      email,
      emergencyType,
      description,
      numberOfPeople,
      location:
        latitude && longitude
          ? {
              type: "Point",
              coordinates: [longitude, latitude],
            }
          : undefined,
      address,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Emit socket event for real-time admin notification
    alertAdmin(submission);

    res.status(201).json({
      success: true,
      message: "SOS form submitted successfully. Help is on the way!",
      data: { id: submission._id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to submit SOS form",
    });
  }
};

/**
 * Record app download intent (public - no auth required)
 */
export const recordAppDownload = async (req: Request, res: Response) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required",
      });
    }

    const submission = await SOSSubmission.create({
      type: "APP_DOWNLOAD",
      name,
      phone,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Emit socket event
    alertAdmin(submission);

    res.status(201).json({
      success: true,
      message: "Thank you for your interest! The app is coming soon.",
      data: { id: submission._id },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record",
    });
  }
};
