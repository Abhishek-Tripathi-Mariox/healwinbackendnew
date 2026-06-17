import { Request, Response, NextFunction } from "express";
import {
  StaffLeave,
  StaffCaseNote,
  StaffStockRequest,
} from "../../models/ambulance-staff-extras.model";

/**
 * Admin read/management endpoints for the records the ambulance-staff app
 * creates (Leave / Case-notes / Stock). The staff app writes these via
 * /ambulance-staff/*; these handlers let the admin panel see and action them.
 * (Staff-registered patients are NOT here — they go straight into the HMS
 * HospitalPatient registry and show on the admin Patients page.)
 */

const STAFF_FIELDS = "fullName mobileNumber";

const optionalStaffFilter = (req: Request) => {
  const { staffId } = req.query as { staffId?: string };
  return staffId ? { staffId } : {};
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
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Leave applications -----
export const listLeaves = async (req: Request, _res: Response, next: NextFunction) => {
  const { status } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { ...optionalStaffFilter(req) };
  if (status) q.status = status;
  const items = await StaffLeave.find(q)
    .populate("staffId", STAFF_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  req.rData = { items };
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
  const item = await StaffLeave.findByIdAndUpdate(
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
  req.rData = { item };
  req.msg = "success";
  return next();
};
