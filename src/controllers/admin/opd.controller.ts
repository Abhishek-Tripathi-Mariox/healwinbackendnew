import { Request, Response, NextFunction } from "express";
import Appointment from "../../models/appointment.model";
import HospitalPatient from "../../models/hospital-patient.model";

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

  req.rData = { appointment: appt };
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
