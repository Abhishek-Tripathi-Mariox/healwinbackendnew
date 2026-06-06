import { Request, Response, NextFunction } from "express";
import {
  StaffLeave,
  StaffPatient,
  StaffCaseNote,
  StaffStockRequest,
} from "../models/ambulance-staff-extras.model";

/** Leave / Patient / Case-notes / Stock for the ambulance-staff app. */

const sid = (req: Request) => (req as any).staffId;

// ----- Leave -----
export const listLeaves = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await StaffLeave.find({ staffId: sid(req) }).sort({ createdAt: -1 }).lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const applyLeave = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.type || !b.from || !b.to) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "type, from and to are required" };
    return next();
  }
  const item = await StaffLeave.create({
    staffId: sid(req),
    type: b.type,
    fromDate: new Date(b.from),
    toDate: new Date(b.to),
    day: b.day || "Full Day",
    reason: b.reason,
  });
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Patients -----
export const listPatients = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await StaffPatient.find({ staffId: sid(req) }).sort({ createdAt: -1 }).lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
export const addPatient = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.name) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name is required" };
    return next();
  }
  const item = await StaffPatient.create({
    staffId: sid(req),
    name: b.name,
    mobile: b.mobile,
    dob: b.dob,
    gender: b.gender,
    pincode: b.pincode,
  });
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Case notes -----
export const saveCaseNote = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await StaffCaseNote.create({
    staffId: sid(req),
    dispatchId: b.dispatchId,
    patientId: b.patientId,
    vitals: b.vitals,
    notes: b.notes,
  });
  req.rData = { item };
  req.msg = "success";
  return next();
};

// ----- Stock requests -----
export const createStockRequest = async (req: Request, _res: Response, next: NextFunction) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "items array is required" };
    return next();
  }
  const item = await StaffStockRequest.create({ staffId: sid(req), items });
  req.rData = { item };
  req.msg = "success";
  return next();
};
