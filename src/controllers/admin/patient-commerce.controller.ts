import { Request, Response, NextFunction } from "express";
import {
  Consultation,
  LabBooking,
  PharmacyOrder,
} from "../../models/patient-commerce.model";
import { slotToDate, slotLabelFor } from "../../utils/slots.util";
import { sendToUser } from "../../services/notification.service";

// Friendly patient-facing message for each status, per order kind.
const STATUS_MSG: Record<string, Record<string, { title: string; body: string }>> = {
  consultation: {
    CONFIRMED: { title: "Consultation confirmed", body: "Your doctor consultation is confirmed." },
    COMPLETED: { title: "Consultation completed", body: "Your consultation is marked complete." },
    CANCELLED: { title: "Consultation cancelled", body: "Your consultation was cancelled." },
  },
  lab: {
    SAMPLE_COLLECTED: { title: "Sample collected", body: "Your lab sample has been collected." },
    PROCESSING: { title: "Tests in progress", body: "Your lab tests are being processed." },
    REPORT_READY: { title: "Report ready", body: "Your lab report is ready to view." },
    CANCELLED: { title: "Lab booking cancelled", body: "Your lab booking was cancelled." },
  },
  pharmacy: {
    CONFIRMED: { title: "Order confirmed", body: "Your pharmacy order is confirmed." },
    PACKED: { title: "Order packed", body: "Your medicines are packed." },
    OUT_FOR_DELIVERY: { title: "Out for delivery", body: "Your medicines are out for delivery." },
    DELIVERED: { title: "Order delivered", body: "Your pharmacy order was delivered." },
    CANCELLED: { title: "Order cancelled", body: "Your pharmacy order was cancelled." },
  },
};

/** Notify the patient (in-app + push) about a status change — best-effort. */
const notifyStatus = (kind: "consultation" | "lab" | "pharmacy", item: any, status: string) => {
  const m = STATUS_MSG[kind]?.[status];
  if (!m || !item?.userId) return;
  void sendToUser(item.userId, "BOOKING", m.title, m.body, {
    route: "MyOrders",
    screen: "MyOrders",
  }).catch(() => undefined);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fullSlotLabel = (dateStr: string, time: string): string => {
  const [, m, d] = dateStr.split("-").map(Number);
  const date = m && d ? `${d} ${MONTHS[m - 1]}` : dateStr;
  return `${slotLabelFor(time)}, ${date}`;
};

/** Shared reschedule: set scheduledAt/slotTime/slotLabel from a date + slot. */
const reschedule = (model: any) => async (req: Request, _res: Response, next: NextFunction) => {
  const { date, slot } = req.body || {};
  const when = slotToDate(String(date || ""), String(slot || ""));
  if (!when) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "date (YYYY-MM-DD) and slot (HH:mm) are required" };
    return next();
  }
  const label = fullSlotLabel(String(date), String(slot));
  const item = await model.findByIdAndUpdate(
    req.params.id as string,
    { scheduledAt: when, slotTime: String(slot), slotLabel: label },
    { new: true },
  ).lean();
  if (item?.userId) {
    void sendToUser(item.userId, "BOOKING", "Appointment rescheduled", `Your appointment is now ${label}.`, {
      route: "MyOrders",
      screen: "MyOrders",
    }).catch(() => undefined);
  }
  req.rData = { item };
  req.msg = "success";
  return next();
};

export const rescheduleConsultation = reschedule(Consultation);
export const rescheduleLabBooking = reschedule(LabBooking);

/**
 * Admin inbox for the patient-app commerce flows — doctor consultations, lab
 * bookings and pharmacy orders. The patient app creates these; these handlers
 * let the admin see them and advance their status (confirm → fulfil → close,
 * or cancel). Each populates the owning patient for display.
 */

const USER_FIELDS = "fullName mobileNumber countryCode";

const CONSULTATION_STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"];
const LAB_STATUSES = ["BOOKED", "SAMPLE_COLLECTED", "PROCESSING", "REPORT_READY", "CANCELLED"];
const PHARMACY_STATUSES = [
  "PLACED",
  "CONFIRMED",
  "PACKED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

const statusFilter = (req: Request): any => {
  const { status } = req.query as { status?: string };
  return status ? { status } : {};
};

// ----- Consultations -----
export const listConsultations = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await Consultation.find(statusFilter(req))
    .populate("userId", USER_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const updateConsultationStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toUpperCase();
  if (!CONSULTATION_STATUSES.includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `status must be one of ${CONSULTATION_STATUSES.join(", ")}` };
    return next();
  }
  const item = await Consultation.findByIdAndUpdate(
    req.params.id as string,
    { status },
    { new: true },
  ).lean();
  notifyStatus("consultation", item, status);
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Lab bookings -----
export const listLabBookings = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await LabBooking.find(statusFilter(req))
    .populate("userId", USER_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const updateLabBookingStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toUpperCase();
  if (!LAB_STATUSES.includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `status must be one of ${LAB_STATUSES.join(", ")}` };
    return next();
  }
  const item = await LabBooking.findByIdAndUpdate(
    req.params.id as string,
    { status },
    { new: true },
  ).lean();
  notifyStatus("lab", item, status);
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Pharmacy orders -----
export const listPharmacyOrders = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await PharmacyOrder.find(statusFilter(req))
    .populate("userId", USER_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const updatePharmacyOrderStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toUpperCase();
  if (!PHARMACY_STATUSES.includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `status must be one of ${PHARMACY_STATUSES.join(", ")}` };
    return next();
  }
  const item = await PharmacyOrder.findByIdAndUpdate(
    req.params.id as string,
    { status },
    { new: true },
  ).lean();
  notifyStatus("pharmacy", item, status);
  req.rData = { item };
  req.msg = "success";
  return next();
};
