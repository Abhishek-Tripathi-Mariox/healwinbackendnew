import { Types } from "mongoose";
import {
  EmergencyContact,
  SOSAlert,
  IEmergencyContact,
  ISOSAlert,
} from "../models/sos.model";
import Booking from "../models/booking.model";
import Driver from "../models/driver.model";
import User from "../models/Users";
import * as NotificationService from "./notification.service";
import socketUtils from "../utils/socket.util";

const MAX_EMERGENCY_CONTACTS = 5;

/**
 * Add emergency contact
 */
export const addEmergencyContact = async (
  userId: Types.ObjectId,
  data: {
    name: string;
    phone: string;
    relationship: string;
    isPrimary?: boolean;
  },
): Promise<IEmergencyContact> => {
  // Check limit
  const existingCount = await EmergencyContact.countDocuments({
    userId,
    isActive: true,
  });
  if (existingCount >= MAX_EMERGENCY_CONTACTS) {
    throw new Error(
      `Maximum ${MAX_EMERGENCY_CONTACTS} emergency contacts allowed`,
    );
  }

  // If setting as primary, unset others
  if (data.isPrimary) {
    await EmergencyContact.updateMany(
      { userId, isActive: true },
      { isPrimary: false },
    );
  }

  const contact = new EmergencyContact({
    userId,
    ...data,
    isActive: true,
  });
  await contact.save();

  return contact;
};

/**
 * Update emergency contact
 */
export const updateEmergencyContact = async (
  userId: Types.ObjectId,
  contactId: Types.ObjectId,
  data: Partial<IEmergencyContact>,
): Promise<IEmergencyContact | null> => {
  // If setting as primary, unset others
  if (data.isPrimary) {
    await EmergencyContact.updateMany(
      { userId, isActive: true, _id: { $ne: contactId } },
      { isPrimary: false },
    );
  }

  return EmergencyContact.findOneAndUpdate(
    { _id: contactId, userId, isActive: true },
    { $set: data },
    { returnDocument: "after" },
  );
};

/**
 * Delete emergency contact
 */
export const deleteEmergencyContact = async (
  userId: Types.ObjectId,
  contactId: Types.ObjectId,
): Promise<boolean> => {
  const result = await EmergencyContact.updateOne(
    { _id: contactId, userId },
    { isActive: false },
  );
  return result.modifiedCount > 0;
};

/**
 * Get user's emergency contacts
 */
export const getEmergencyContacts = async (
  userId: Types.ObjectId,
): Promise<IEmergencyContact[]> => {
  return EmergencyContact.find({ userId, isActive: true }).sort({
    isPrimary: -1,
    createdAt: 1,
  });
};

/**
 * Trigger SOS alert
 */
export const triggerSOS = async (
  triggeredBy: "USER" | "DRIVER",
  personId: Types.ObjectId,
  location: { lat: number; lng: number },
  bookingId?: Types.ObjectId,
  address?: string,
): Promise<ISOSAlert> => {
  // Get booking details if provided
  let booking = null;
  let userId: Types.ObjectId | undefined;
  let driverId: Types.ObjectId | undefined;

  if (bookingId) {
    booking = await Booking.findById(bookingId);
    userId = booking?.userId;
    driverId = booking?.driverId;
  }

  if (triggeredBy === "USER") {
    userId = personId;
  } else {
    driverId = personId;
  }

  // Create SOS alert
  const sosAlert = new SOSAlert({
    bookingId,
    userId,
    driverId,
    triggeredBy,
    location: {
      type: "Point",
      coordinates: [location.lng, location.lat],
    },
    address,
    status: "ACTIVE",
    contactsNotified: [],
    policeNotified: false,
  });
  await sosAlert.save();

  // Notify emergency contacts
  await notifyEmergencyContacts(sosAlert);

  // NOTE: the admin alarm (sos:new) is emitted by the /sos/trigger controller
  // with the patient's name + address — emitting a second (generic) one here
  // produced a DUPLICATE alert card, so it's intentionally not emitted now.

  // Notify the other party (if user triggers, notify driver and vice versa)
  if (booking) {
    if (triggeredBy === "USER" && booking.driverId) {
      await NotificationService.sendToDriver(
        booking.driverId,
        "SYSTEM",
        "🚨 SOS Alert",
        "User has triggered an emergency alert. Please check on the customer.",
        {
          sosId: sosAlert._id.toString(),
          bookingId: bookingId?.toString() || "",
        },
      );
    } else if (triggeredBy === "DRIVER" && booking.userId) {
      await NotificationService.sendToUser(
        booking.userId,
        "SYSTEM",
        "🚨 SOS Alert",
        "Driver has triggered an emergency alert. Help is on the way.",
        {
          sosId: sosAlert._id.toString(),
          bookingId: bookingId?.toString() || "",
        },
      );
    }
  }

  return sosAlert;
};

/**
 * Notify emergency contacts
 */
const notifyEmergencyContacts = async (sosAlert: ISOSAlert) => {
  const userId =
    sosAlert.triggeredBy === "USER" ? sosAlert.userId : sosAlert.driverId;

  if (!userId) return;

  // Get emergency contacts
  const contacts = await EmergencyContact.find({ userId, isActive: true });

  // Get person's details
  let personName = "";
  if (sosAlert.triggeredBy === "USER") {
    const user = await User.findById(userId);
    personName = user?.name || "Your contact";
  } else {
    const driver = await Driver.findById(userId);
    personName = driver?.fullName || "Your contact";
  }

  const locationUrl = `https://maps.google.com/?q=${sosAlert.location.coordinates[1]},${sosAlert.location.coordinates[0]}`;
  const message = `🚨 EMERGENCY: ${personName} has triggered an SOS alert. Location: ${sosAlert.address || locationUrl}`;

  // In production, integrate with SMS gateway (Twilio, MSG91, etc.)
  for (const contact of contacts) {
    console.log(`SMS to ${contact.phone}: ${message}`);

    // Record notification
    sosAlert.contactsNotified.push({
      contactId: contact._id,
      notifiedAt: new Date(),
      method: "SMS",
    });
  }

  // Save using the model directly
  await SOSAlert.findByIdAndUpdate(sosAlert._id, {
    contactsNotified: sosAlert.contactsNotified,
  });
};

/**
 * Respond to SOS alert (admin)
 */
export const respondToSOS = async (
  sosId: Types.ObjectId,
  adminId: Types.ObjectId,
): Promise<ISOSAlert | null> => {
  const sosAlert = await SOSAlert.findByIdAndUpdate(
    sosId,
    {
      status: "RESPONDED",
      respondedBy: adminId,
      respondedAt: new Date(),
    },
    { returnDocument: "after" },
  );

  if (sosAlert) {
    // Notify user/driver that help is on the way
    if (sosAlert.userId) {
      await NotificationService.sendToUser(
        sosAlert.userId,
        "SYSTEM",
        "Help is on the way",
        "Our team has responded to your SOS. Stay calm and stay safe.",
      );
    }
    if (sosAlert.driverId) {
      await NotificationService.sendToDriver(
        sosAlert.driverId,
        "SYSTEM",
        "Help is on the way",
        "Our team has responded to your SOS. Stay calm and stay safe.",
      );
    }
  }

  return sosAlert;
};

/**
 * Resolve SOS alert
 */
export const resolveSOS = async (
  sosId: Types.ObjectId,
  adminId: Types.ObjectId,
  resolutionNotes: string,
  isFalseAlarm: boolean = false,
): Promise<ISOSAlert | null> => {
  return SOSAlert.findByIdAndUpdate(
    sosId,
    {
      status: isFalseAlarm ? "FALSE_ALARM" : "RESOLVED",
      resolvedAt: new Date(),
      resolutionNotes,
    },
    { returnDocument: "after" },
  );
};

/**
 * Cancel SOS by user/driver
 */
export const cancelSOS = async (
  sosId: Types.ObjectId,
  personId: Types.ObjectId,
  personType: "USER" | "DRIVER",
): Promise<ISOSAlert | null> => {
  const query: any = { _id: sosId, status: "ACTIVE" };
  if (personType === "USER") {
    query.userId = personId;
  } else {
    query.driverId = personId;
  }

  return SOSAlert.findOneAndUpdate(
    query,
    {
      status: "FALSE_ALARM",
      resolvedAt: new Date(),
      resolutionNotes: "Cancelled by " + personType.toLowerCase(),
    },
    { returnDocument: "after" },
  );
};

/**
 * Get active SOS alerts (admin)
 */
export const getActiveSOSAlerts = async () => {
  return SOSAlert.find({ status: "ACTIVE" })
    .populate("userId", "name mobileNumber")
    .populate("driverId", "name mobileNumber")
    .populate("bookingId", "bookingNumber")
    .sort({ createdAt: -1 });
};

/**
 * Get SOS alert by ID
 */
export const getSOSById = async (
  sosId: Types.ObjectId,
): Promise<ISOSAlert | null> => {
  return SOSAlert.findById(sosId)
    .populate("userId", "name mobileNumber email")
    .populate("driverId", "name mobileNumber")
    .populate("bookingId")
    .populate("respondedBy", "name email")
    .populate("contactsNotified.contactId");
};

/**
 * Get SOS history for user/driver
 */
export const getSOSHistory = async (
  personId: Types.ObjectId,
  personType: "USER" | "DRIVER",
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;
  const query: any =
    personType === "USER" ? { userId: personId } : { driverId: personId };

  const [alerts, total] = await Promise.all([
    SOSAlert.find(query)
      .populate("bookingId", "bookingNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SOSAlert.countDocuments(query),
  ]);

  return {
    alerts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Share live location with emergency contacts
 */
export const shareLiveLocation = async (
  userId: Types.ObjectId,
  bookingId: Types.ObjectId,
  duration: number = 30, // minutes
): Promise<{ shareId: string; expiresAt: Date }> => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + duration);

  // Generate unique share ID
  const shareId = `share_${userId}_${bookingId}_${Date.now()}`;

  // In production, store this in Redis with TTL
  // await cache.set(`location_share:${shareId}`, { userId, bookingId }, duration * 60);

  // Notify emergency contacts with share link
  const contacts = await EmergencyContact.find({ userId, isActive: true });
  const shareUrl = `https://healwin.app/track/${shareId}`;

  const user = await User.findById(userId);
  const message = `${user?.name || "Your contact"} is sharing their live location with you: ${shareUrl}`;

  for (const contact of contacts) {
    console.log(`SMS to ${contact.phone}: ${message}`);
  }

  return { shareId, expiresAt };
};

/**
 * Notify police (admin action)
 */
export const notifyPolice = async (
  sosId: Types.ObjectId,
  adminId: Types.ObjectId,
): Promise<ISOSAlert | null> => {
  // In production, integrate with local police API or emergency services
  console.log(`Police notified for SOS: ${sosId} by admin: ${adminId}`);

  return SOSAlert.findByIdAndUpdate(
    sosId,
    {
      policeNotified: true,
      policeNotifiedAt: new Date(),
    },
    { returnDocument: "after" },
  );
};
