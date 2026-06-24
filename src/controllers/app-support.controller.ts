import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { SupportTicket, SupportMessage } from "../models/support-ticket.model";
import * as SupportService from "../services/support.service";

/**
 * Shared support-ticket handlers for the in-app requester roles — driver and
 * ambulance staff. Mirrors the patient `support.controller`, but every ticket
 * is scoped to the logged-in driver/staff and messages are tagged with their
 * senderType so the admin panel and the chat thread can tell who wrote what.
 *
 * Mounted under /driver/tickets (verifyDriverToken) and
 * /ambulance-staff/tickets (verifyStaffToken). These routes use the
 * ErrorHandler + Response middleware pair, so handlers set req.rData / req.msg
 * / req.rCode and call next().
 */
type Kind = "DRIVER" | "STAFF";

export const makeSupportHandlers = (kind: Kind) => {
  const reqIdField = kind === "DRIVER" ? "driverId" : "staffId";
  const getId = (req: Request) => String((req as any)[reqIdField] || "");
  const ownerQuery = (id: string) =>
    kind === "DRIVER" ? { driverId: id } : { staffId: id };

  const notFound = (req: Request, next: NextFunction) => {
    req.rCode = 5;
    req.msg = "item_not_found";
    req.rData = {};
    return next();
  };

  // Raise a new ticket. The first message seeds the thread.
  const createTicket = async (req: Request, _res: Response, next: NextFunction) => {
    const id = getId(req);
    const { category, subject, message, bookingId, priority } = req.body || {};
    if (!category || !subject || !message) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = { hint: "category, subject and message are required" };
      return next();
    }
    const owner =
      kind === "DRIVER"
        ? { driverId: new Types.ObjectId(id) }
        : { staffId: new Types.ObjectId(id) };
    const ticket = await SupportService.createTicket({
      ...owner,
      bookingId: bookingId || undefined,
      category,
      subject,
      description: message,
      priority,
    });
    await SupportService.addMessage({
      ticketId: ticket._id,
      senderId: new Types.ObjectId(id),
      senderType: kind,
      message,
    });
    req.rData = { ticket };
    return next();
  };

  // List my tickets (newest first), optionally filtered by status.
  const getMyTickets = async (req: Request, _res: Response, next: NextFunction) => {
    const id = new Types.ObjectId(getId(req));
    const status = (req.query.status as any) || undefined;
    const tickets =
      kind === "DRIVER"
        ? await SupportService.getDriverTickets(id, status)
        : await SupportService.getStaffTickets(id, status);
    req.rData = { tickets };
    return next();
  };

  // One ticket + its full message thread.
  const getTicket = async (req: Request, _res: Response, next: NextFunction) => {
    const id = getId(req);
    const ticket = await SupportTicket.findOne({
      _id: req.params.ticketId,
      ...ownerQuery(id),
    }).populate("bookingId", "bookingNumber status");
    if (!ticket) return notFound(req, next);

    const messages = await SupportMessage.find({ ticketId: ticket._id }).sort({
      createdAt: 1,
    });
    req.rData = { ticket, messages };
    return next();
  };

  // Reply on a ticket (re-opens a resolved/closed one via the service).
  const addMessage = async (req: Request, _res: Response, next: NextFunction) => {
    const id = getId(req);
    const { message, attachments } = req.body || {};
    const ticket = await SupportTicket.findOne({
      _id: req.params.ticketId,
      ...ownerQuery(id),
    });
    if (!ticket) return notFound(req, next);

    ticket.lastMessageAt = new Date();
    await ticket.save();

    const newMessage = await SupportService.addMessage({
      ticketId: ticket._id,
      senderId: new Types.ObjectId(id),
      senderType: kind,
      message,
      attachments,
    });
    req.rData = { message: newMessage };
    return next();
  };

  // Close (resolve) my own ticket, with optional rating/feedback.
  const closeTicket = async (req: Request, _res: Response, next: NextFunction) => {
    const id = getId(req);
    const { rating, feedback } = req.body || {};
    const ticket = await SupportTicket.findOne({
      _id: req.params.ticketId,
      ...ownerQuery(id),
    });
    if (!ticket) return notFound(req, next);

    ticket.status = "CLOSED";
    ticket.closedAt = new Date();
    if (rating) ticket.rating = rating;
    if (feedback) ticket.feedback = feedback;
    await ticket.save();
    req.rData = { ticket };
    return next();
  };

  return { createTicket, getMyTickets, getTicket, addMessage, closeTicket };
};
