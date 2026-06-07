import { Request, Response } from "express";
import * as SupportService from "../../services/support.service";
import { Types } from "mongoose";

/**
 * Get all tickets
 */
export const getAllTickets = async (req: Request, res: Response) => {
  const { status, priority, category, page = 0, limit = 20 } = req.query;

  const result = await SupportService.getAllTickets(
    {
      status: status as any,
      priority: priority as any,
      category: category as string,
    },
    Number(page),
    Number(limit),
  );

  res.locals.data = result;
};

/**
 * Get ticket by ID
 */
export const getTicket = async (req: Request, res: Response) => {
  const { ticketId } = req.params as Record<string, string>;

  const ticket = await SupportService.getTicketById(ticketId);

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found",
    });
  }

  const messages = await SupportService.getTicketMessages(ticket._id);

  res.locals.data = { ticket, messages };
};

/**
 * Assign ticket to admin
 */
export const assignTicket = async (req: Request, res: Response) => {
  const { ticketId } = req.params as Record<string, string>;
  const { adminId } = req.body;

  const ticket = await SupportService.assignTicket(
    ticketId,
    new Types.ObjectId(adminId || req.adminId),
  );

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found",
    });
  }

  res.locals.data = {
    message: "Ticket assigned successfully",
    ticket,
  };
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (req: Request, res: Response) => {
  const { ticketId } = req.params as Record<string, string>;
  const { status, resolution } = req.body;

  const ticket = await SupportService.updateTicketStatus(
    ticketId,
    status,
    resolution,
  );

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found",
    });
  }

  res.locals.data = {
    message: "Ticket status updated",
    ticket,
  };
};

/**
 * Reply to ticket
 */
export const replyToTicket = async (req: Request, res: Response) => {
  const { ticketId } = req.params as Record<string, string>;
  const { message, attachments } = req.body;

  const ticket = await SupportService.getTicketById(ticketId);

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Ticket not found",
    });
  }

  const newMessage = await SupportService.addMessage({
    ticketId: ticket._id,
    senderId: new Types.ObjectId(req.adminId),
    senderType: "ADMIN",
    message,
    attachments,
  });

  res.locals.data = {
    message: "Reply sent successfully",
    newMessage,
  };
};

/**
 * Get support stats
 */
export const getStats = async (req: Request, res: Response) => {
  const stats = await SupportService.getTicketStats();
  const categories = SupportService.getSupportCategories();

  res.locals.data = { stats, categories };
};
