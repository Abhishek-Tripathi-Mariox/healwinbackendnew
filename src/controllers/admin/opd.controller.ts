import { Request, Response, NextFunction } from "express";
import Appointment from "../../models/appointment.model";
import HospitalPatient from "../../models/hospital-patient.model";
import { createConsultationInvoice } from "./billing.controller";

/**
 * Doctor Panel / HMS — OPD appointments & queue tokens.
 */

const STATUSES = new Set([
  "booked",
  "checked_in",
  "in_consultation",
  "completed",
  "cancelled",
  "no_show",
]);

const dayBounds = (d: Date) => {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

/** GET /admin/opd?date=&doctorId=&status= — queue board (defaults to today). */
export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const { start, end } = dayBounds(date);
  const query: any = { scheduledAt: { $gte: start, $lt: end } };
  if (req.query.doctorId) query.doctorId = req.query.doctorId;
  if (req.query.status) query.status = req.query.status;

  const appointments = await Appointment.find(query)
    .sort({ scheduledAt: 1, tokenNumber: 1 })
    .populate("patientId", "patientId fullName phone gender age")
    .populate("doctorId", "fullName")
    .populate("invoiceId", "invoiceNo total amountPaid balanceDue status")
    .lean();

  req.rData = { date: start, appointments };
  req.msg = "appointment_list";
  return next();
};

/** POST /admin/opd — book an appointment; mints the doctor's next day token. */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.patientId || !b.doctorId || !b.scheduledAt) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "patientId, doctorId and scheduledAt are required" };
    return next();
  }
  const scheduledAt = new Date(b.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "scheduledAt is not a valid date" };
    return next();
  }
  const patient = await HospitalPatient.findOne({
    _id: b.patientId,
    isDeleted: false,
  }).lean();
  if (!patient) {
    req.rCode = 5;
    req.msg = "patient_not_found";
    req.rData = {};
    return next();
  }

  // Token = (count of that doctor's appointments that day) + 1.
  const { start, end } = dayBounds(scheduledAt);
  const todays = await Appointment.countDocuments({
    doctorId: b.doctorId,
    scheduledAt: { $gte: start, $lt: end },
    status: { $ne: "cancelled" },
  });

  const appt = await Appointment.create({
    patientId: b.patientId,
    doctorId: b.doctorId,
    scheduledAt,
    tokenNumber: todays + 1,
    reason: b.reason || undefined,
    notes: b.notes || undefined,
    createdByAdminId: adminId,
  });

  // Raise the consultation bill immediately so the front desk can collect at
  // booking time. Deliberately best-effort: a missing doctor fee or a billing
  // failure must never lose a confirmed appointment, so we swallow the error
  // and leave invoiceId null (the OPD board then shows "no bill").
  try {
    const invoice = await createConsultationInvoice({
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      appointmentId: appt._id,
      adminId,
    });
    if (invoice) {
      appt.invoiceId = invoice._id as any;
      await appt.save();
    }
  } catch {
    /* billing is non-blocking — appointment stands */
  }

  const created = await Appointment.findById(appt._id)
    .populate("patientId", "patientId fullName phone gender age")
    .populate("doctorId", "fullName")
    .populate("invoiceId", "invoiceNo total amountPaid balanceDue status")
    .lean();

  req.rData = { appointment: created };
  req.msg = "appointment_created";
  return next();
};

/** PUT /admin/opd/:id — update status / notes / follow-up. */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const appt = await Appointment.findById(req.params.id);
  if (!appt) {
    req.rCode = 5;
    req.msg = "appointment_not_found";
    req.rData = {};
    return next();
  }
  if (b.status !== undefined) {
    if (!STATUSES.has(b.status)) {
      req.rCode = 0;
      req.msg = "validation_failed";
      req.rData = { hint: "invalid status" };
      return next();
    }
    appt.status = b.status;
  }
  if (b.notes !== undefined) appt.notes = b.notes;
  if (b.reason !== undefined) appt.reason = b.reason;
  if (b.encounterId !== undefined) appt.encounterId = b.encounterId;
  if (b.followUpAt !== undefined)
    appt.followUpAt = b.followUpAt ? new Date(b.followUpAt) : undefined;
  if (b.scheduledAt !== undefined) {
    const d = new Date(b.scheduledAt);
    if (!Number.isNaN(d.getTime())) appt.scheduledAt = d;
  }
  await appt.save();

  req.rData = { appointment: appt };
  req.msg = "appointment_updated";
  return next();
};

export default { list, create, update };


/**
 * PUT /admin/opd/:id/vitals — nurse / front desk records vitals at check-in.
 *
 * Kept off the doctor's encounter form deliberately: in a real clinic triage
 * takes vitals before the consult, and the doctor reads them. The encounter
 * form pre-fills from here.
 */
export const recordVitals = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body?.vitals ?? req.body ?? {};
  const appt = await Appointment.findById(req.params.id as string);
  if (!appt) {
    req.rCode = 5;
    req.msg = "appointment_not_found";
    req.rData = {};
    return next();
  }

  const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  appt.vitals = {
    bloodPressure: b.bloodPressure ? String(b.bloodPressure).trim() : undefined,
    pulse: num(b.pulse),
    temperature: num(b.temperature),
    spo2: num(b.spo2),
    respiratoryRate: num(b.respiratoryRate),
    height: num(b.height),
    weight: num(b.weight),
  };
  appt.vitalsRecordedByAdminId = adminId;
  appt.vitalsRecordedAt = new Date();
  await appt.save();

  req.rData = { appointment: appt };
  req.msg = "vitals_recorded";
  return next();
};


/** GET /admin/opd/:id — one appointment (used by the encounter form to read the nurse's vitals). */
export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const appt = await Appointment.findById(req.params.id as string)
    .populate("patientId", "patientId fullName phone gender age")
    .populate("doctorId", "fullName")
    .populate("vitalsRecordedByAdminId", "fullName")
    .lean();
  if (!appt) {
    req.rCode = 5;
    req.msg = "appointment_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { appointment: appt };
  req.msg = "appointment_detail";
  return next();
};
