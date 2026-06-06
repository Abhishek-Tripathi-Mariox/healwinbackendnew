import { Request, Response } from "express";
import { SOSSubmission } from "../models/sos-submission.model";

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
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("sos:new-submission", {
        type: "CALL",
        submission,
      });
    }

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
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("sos:new-submission", {
        type: "FORM",
        submission,
      });
    }

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
    const io = req.app.get("io");
    if (io) {
      io.to("admin").emit("sos:new-submission", {
        type: "APP_DOWNLOAD",
        submission,
      });
    }

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
