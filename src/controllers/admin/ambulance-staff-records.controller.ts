import { Request, Response, NextFunction } from "express";
import {
  StaffCaseNote,
  StaffStockRequest,
} from "../../models/ambulance-staff-extras.model";
import LeaveRequest from "../../models/leave-request.model";
import { HospitalPatient } from "../../models/hospital-patient.model";
import { sendToStaff } from "../../services/notification.service";

/**
 * Admin read/management endpoints for the records the ambulance-staff app
 * creates (Leave / Case-notes / Stock). The staff app writes these via
 * /ambulance-staff/*; these handlers let the admin panel see and action them.
 * (Staff-registered patients are NOT here — they go straight into the HMS
 * HospitalPatient registry and show on the admin Patients page.)
 */

const STAFF_FIELDS = "fullName mobileNumber";

/** Short, human date for notification copy, e.g. "5 Jun". */
const fmtDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const optionalStaffFilter = (req: Request) => {
  const { staffId } = req.query as { staffId?: string };
  return staffId ? { staffId } : {};
};

// ----- Patients registered by ambulance staff -----
export const listStaffPatients = async (req: Request, _res: Response, next: NextFunction) => {
  const q: Record<string, unknown> = { source: "ambulance_staff", isDeleted: false };
  if ((req.query as any).staffId) q.registeredByStaffId = (req.query as any).staffId;
  const items = await HospitalPatient.find(q)
    .populate("registeredByStaffId", STAFF_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

// ----- Case notes -----
export const listCaseNotes = async (req: Request, _res: Response, next: NextFunction) => {
  const { dispatchId, patientId } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { ...optionalStaffFilter(req) };
  if (dispatchId) q.dispatchId = dispatchId;
  if (patientId) q.patientId = patientId;
  const items = await StaffCaseNote.find(q)
    .populate("staffId", STAFF_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

// ----- Stock requests -----
export const listStockRequests = async (req: Request, _res: Response, next: NextFunction) => {
  const { status } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { ...optionalStaffFilter(req) };
  if (status) q.status = status;
  const items = await StaffStockRequest.find(q)
    .populate("staffId", STAFF_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const updateStockRequestStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = req.body?.status;
  if (!["Pending", "Fulfilled", "Rejected"].includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "status must be Pending | Fulfilled | Rejected" };
    return next();
  }
  const item = await StaffStockRequest.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true },
  )
    .populate("staffId", STAFF_FIELDS)
    .lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "item_not_found";
    return next();
  }

  // Notify the staff member their stock request was actioned.
  const stockStaffId = (item.staffId as any)?._id || item.staffId;
  if (stockStaffId && status !== "Pending") {
    const itemNames = (item.items || []).map((i: any) => i.name).join(", ");
    sendToStaff(
      stockStaffId,
      "SYSTEM",
      status === "Fulfilled" ? "Stock Request Fulfilled" : "Stock Request Rejected",
      status === "Fulfilled"
        ? `Your stock request${itemNames ? ` (${itemNames})` : ""} has been fulfilled.`
        : `Your stock request${itemNames ? ` (${itemNames})` : ""} was rejected.`,
      { stockRequestId: String(item._id), status, route: "StockRequests" },
      item._id,
      "StaffStockRequest",
    ).catch(() => undefined);
  }

  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Leave applications (central LeaveRequest store, ambulance_staff subset) -----
// Legacy shape kept so the existing admin staff page renders unchanged.
const toLegacyLeave = (lr: any) => ({
  _id: lr._id,
  staffId: lr.ambulanceStaffId,
  type: lr.leaveTypeName || "Leave",
  fromDate: lr.fromDate,
  toDate: lr.toDate,
  day: lr.halfDay ? "Half Day" : "Full Day",
  reason: lr.reason,
  attachmentUrl: lr.attachmentUrl,
  status: lr.status === "approved" ? "Approved" : lr.status === "rejected" ? "Rejected" : "Pending",
  createdAt: lr.createdAt,
});

export const listLeaves = async (req: Request, _res: Response, next: NextFunction) => {
  const { status, staffId } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { subjectType: "ambulance_staff" };
  if (staffId) q.ambulanceStaffId = staffId;
  if (status) q.status = status.toLowerCase();
  const rows = await LeaveRequest.find(q)
    .populate("ambulanceStaffId", STAFF_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items: rows.map(toLegacyLeave) };
  req.msg = "success";
  return next();
};

export const updateLeaveStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = req.body?.status;
  if (!["Pending", "Approved", "Rejected"].includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "status must be Pending | Approved | Rejected" };
    return next();
  }
  const mapped = status === "Approved" ? "approved" : status === "Rejected" ? "rejected" : "pending";
  const lr: any = await LeaveRequest.findByIdAndUpdate(
    req.params.id,
    { status: mapped, approverAdminId: (req as any).adminId, decidedAt: new Date() },
    { new: true },
  )
    .populate("ambulanceStaffId", STAFF_FIELDS)
    .lean();
  if (!lr) {
    req.rCode = 5;
    req.msg = "item_not_found";
    return next();
  }

  // Notify the staff member of the decision (push + in-app bell).
  const leaveStaffId = (lr.ambulanceStaffId as any)?._id || lr.ambulanceStaffId;
  if (leaveStaffId && status !== "Pending") {
    const range = `${fmtDate(lr.fromDate)}–${fmtDate(lr.toDate)}`;
    sendToStaff(
      leaveStaffId,
      "SYSTEM",
      status === "Approved" ? "Leave Approved" : "Leave Rejected",
      status === "Approved"
        ? `Your ${lr.leaveTypeName || "leave"} leave (${range}) has been approved.`
        : `Your ${lr.leaveTypeName || "leave"} leave (${range}) was rejected.`,
      { leaveId: String(lr._id), status, route: "Leave" },
      lr._id,
      "LeaveRequest",
    ).catch(() => undefined);
  }

  req.rData = { item: toLegacyLeave(lr) };
  req.msg = "success";
  return next();
};
