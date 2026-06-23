import {
  SupportTicket,
  SupportMessage,
  ISupportTicket,
  ISupportMessage,
} from "../models/support-ticket.model";
import { Types } from "mongoose";
import { emitToUser, emitToAdmin } from "../utils/socket.util";
import { sendToUser } from "./notification.service";

/**
 * Generate unique ticket ID
 */
const generateTicketId = async (): Promise<string> => {
  const prefix = "TKT";
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

  const count = await SupportTicket.countDocuments({
    createdAt: {
      $gte: new Date(date.setHours(0, 0, 0, 0)),
      $lt: new Date(date.setHours(23, 59, 59, 999)),
    },
  });

  return `${prefix}${dateStr}${String(count + 1).padStart(4, "0")}`;
};

/**
 * Create support ticket
 */
export const createTicket = async (data: {
  userId?: Types.ObjectId;
  driverId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  category: string;
  subcategory?: string;
  subject: string;
  description: string;
  priority?: ISupportTicket["priority"];
  attachments?: string[];
}) => {
  const ticketId = await generateTicketId();

  const ticket = await SupportTicket.create({
    ticketId,
    ...data,
    priority: data.priority || "MEDIUM",
    status: "OPEN",
  });

  return ticket;
};

/**
 * Get tickets for user
 */
export const getUserTickets = async (
  userId: Types.ObjectId,
  status?: ISupportTicket["status"],
  page = 0,
  limit = 10,
) => {
  const query: any = { userId };
  if (status) query.status = status;

  return await SupportTicket.find(query)
    .populate("bookingId", "bookingNumber status")
    .sort({ createdAt: -1 })
    .skip(page * limit)
    .limit(limit);
};

/**
 * Get tickets for driver
 */
export const getDriverTickets = async (
  driverId: Types.ObjectId,
  status?: ISupportTicket["status"],
  page = 0,
  limit = 10,
) => {
  const query: any = { driverId };
  if (status) query.status = status;

  return await SupportTicket.find(query)
    .populate("bookingId", "bookingNumber status")
    .sort({ createdAt: -1 })
    .skip(page * limit)
    .limit(limit);
};

/**
 * Get all tickets (Admin)
 */
export const getAllTickets = async (
  filters: {
    status?: ISupportTicket["status"];
    priority?: ISupportTicket["priority"];
    category?: string;
    assignedTo?: Types.ObjectId;
    dateFrom?: Date;
    dateTo?: Date;
  },
  page = 0,
  limit = 20,
) => {
  const query: any = {};

  if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  if (filters.category) query.category = filters.category;
  if (filters.assignedTo) query.assignedTo = filters.assignedTo;
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = filters.dateFrom;
    if (filters.dateTo) query.createdAt.$lte = filters.dateTo;
  }

  const tickets = await SupportTicket.find(query)
    .populate("userId", "fullName mobileNumber")
    .populate("driverId", "fullName mobileNumber")
    .populate("bookingId", "bookingNumber status")
    .populate("assignedTo", "fullName")
    .sort({ priority: -1, createdAt: -1 })
    .skip(page * limit)
    .limit(limit);

  const total = await SupportTicket.countDocuments(query);

  return { tickets, total, page, limit };
};

/**
 * Get ticket by ID
 */
export const getTicketById = async (ticketId: string) => {
  return await SupportTicket.findOne({ ticketId })
    .populate("userId", "fullName mobileNumber email")
    .populate("driverId", "fullName mobileNumber email")
    .populate("bookingId")
    .populate("assignedTo", "fullName email");
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (
  ticketId: string,
  status: ISupportTicket["status"],
  note?: string,
) => {
  const update: any = { status };
  const unset: any = {};

  if (status === "RESOLVED") {
    update.resolvedAt = new Date();
    if (note) update.resolution = note;
  } else if (status === "CLOSED") {
    update.closedAt = new Date();
    if (note) update.resolution = note;
  } else if (status === "OPEN" || status === "IN_PROGRESS") {
    // Re-opening a previously resolved/closed ticket: record why, and clear the
    // resolution timestamps so it counts as active again.
    if (note) {
      update.reopenReason = note;
      update.reopenedAt = new Date();
    }
    unset.resolvedAt = "";
    unset.closedAt = "";
  }

  const mod: any = { $set: update };
  if (Object.keys(unset).length) mod.$unset = unset;

  return await SupportTicket.findOneAndUpdate({ ticketId }, mod, {
    returnDocument: "after",
  });
};

/**
 * Assign ticket to admin
 */
export const assignTicket = async (
  ticketId: string,
  adminId: Types.ObjectId,
) => {
  return await SupportTicket.findOneAndUpdate(
    { ticketId },
    { assignedTo: adminId, status: "IN_PROGRESS" },
    { returnDocument: "after" },
  );
};

/**
 * Add message to ticket
 */
export const addMessage = async (data: {
  ticketId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: ISupportMessage["senderType"];
  message: string;
  attachments?: string[];
}) => {
  const message = await SupportMessage.create(data);

  // Update ticket status if user replied
  if (data.senderType === "USER" || data.senderType === "DRIVER") {
    await SupportTicket.findByIdAndUpdate(data.ticketId, {
      status: "OPEN",
    });
  } else if (data.senderType === "ADMIN") {
    await SupportTicket.findByIdAndUpdate(data.ticketId, {
      status: "WAITING_FOR_USER",
    });
  }

  // Real-time: push the new message to the OTHER party so the chat updates live.
  try {
    const ticket = await SupportTicket.findById(data.ticketId)
      .select("ticketId userId subject")
      .lean();
    if (ticket) {
      const payload = {
        ticketId: ticket.ticketId,
        _id: String(message._id),
        senderType: data.senderType,
        message: data.message,
        createdAt: (message as any).createdAt,
      };
      if (data.senderType === "ADMIN" || data.senderType === "SYSTEM") {
        // Support → patient: live socket + a push notification.
        if (ticket.userId) {
          emitToUser(String(ticket.userId), "support:message", payload);
          void sendToUser(
            ticket.userId as any,
            "SYSTEM",
            `Support replied · ${ticket.subject || ticket.ticketId}`,
            data.message,
            { ticketId: ticket.ticketId, route: "TicketDetail" },
          ).catch(() => undefined);
        }
      } else {
        // Patient → support: let the admin panel update live.
        emitToAdmin("support:message", payload);
      }
    }
  } catch {
    /* realtime is best-effort */
  }

  return message;
};

/**
 * Get messages for ticket
 */
export const getTicketMessages = async (
  ticketId: Types.ObjectId,
  page = 0,
  limit = 50,
) => {
  return await SupportMessage.find({ ticketId })
    .sort({ createdAt: 1 })
    .skip(page * limit)
    .limit(limit);
};

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (
  ticketId: Types.ObjectId,
  readerId: Types.ObjectId,
) => {
  return await SupportMessage.updateMany(
    { ticketId, senderId: { $ne: readerId }, isRead: false },
    { isRead: true },
  );
};

/**
 * Get support ticket stats (Admin)
 */
export const getTicketStats = async () => {
  const stats = await SupportTicket.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const priorityStats = await SupportTicket.aggregate([
    { $match: { status: { $nin: ["RESOLVED", "CLOSED"] } } },
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);

  const categoryStats = await SupportTicket.aggregate([
    { $match: { status: { $nin: ["RESOLVED", "CLOSED"] } } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    byStatus: stats,
    byPriority: priorityStats,
    byCategory: categoryStats,
  };
};

/**
 * Get predefined categories
 */
export const getSupportCategories = () => {
  return [
    {
      category: "Booking Issues",
      subcategories: [
        "Driver not arriving",
        "Wrong address",
        "Price mismatch",
        "Booking cancelled",
      ],
    },
    {
      category: "Payment Issues",
      subcategories: [
        "Payment failed",
        "Refund not received",
        "Overcharged",
        "Wallet issues",
      ],
    },
    {
      category: "Driver Complaints",
      subcategories: [
        "Rude behavior",
        "Unprofessional conduct",
        "Safety concern",
        "Vehicle condition",
      ],
    },
    {
      category: "Account Issues",
      subcategories: [
        "Login problems",
        "Profile update",
        "Delete account",
        "OTP not received",
      ],
    },
    {
      category: "Others",
      subcategories: ["Feedback", "Suggestion", "General inquiry"],
    },
  ];
};
