import { Request, Response, NextFunction } from "express";
import Ambulance from "../../models/ambulance.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ambulance = await Ambulance.create({
    ...req.body,
    status: "offline",
  });
  req.rData = { ambulance };
  req.msg = "ambulance_created";
  next();
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const {
    providerId,
    status,
    ambulanceType,
    isActive,
    search,
    page = "1",
    limit = "20",
  } = req.query as any;
  const filter: any = {};
  if (providerId) filter.providerId = providerId;
  if (status) filter.status = status;
  if (ambulanceType) filter.ambulanceType = ambulanceType;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (search) {
    filter.registrationNumber = {
      $regex: String(search).toUpperCase(),
      $options: "i",
    };
  }

  const pg = Math.max(1, parseInt(page as string, 10));
  const lim = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

  const [items, total] = await Promise.all([
    Ambulance.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate("providerId", "name phone")
      .populate("assignedDriverId", "fullName mobileNumber")
      .populate("assignedAttendantId", "fullName mobileNumber")
      .lean(),
    Ambulance.countDocuments(filter),
  ]);

  req.rData = { items, total, page: pg, limit: lim };
  req.msg = "ambulances_listed";
  next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ambulance = await Ambulance.findById(req.params.id)
    .populate("providerId")
    .populate("assignedDriverId")
    .populate("assignedAttendantId")
    .lean();
  if (!ambulance) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { ambulance };
  req.msg = "ambulance_detail";
  next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ambulance = await Ambulance.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: "after",
  });
  if (!ambulance) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { ambulance };
  req.msg = "ambulance_updated";
  next();
};

export const assign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { staffId, role } = req.body as {
    staffId: string;
    role: "driver" | "attendant";
  };

  const ambulance = await Ambulance.findById(req.params.id);
  if (!ambulance) {
    req.rCode = 5;
    req.msg = "ambulance_not_found";
    req.rData = {};
    return next();
  }

  const staff = await AmbulanceStaff.findById(staffId);
  if (!staff || !staff.isActive || staff.isDeleted) {
    req.rCode = 5;
    req.msg = "staff_not_found";
    req.rData = {};
    return next();
  }

  if (staff.role !== role) {
    req.rCode = 0;
    req.msg = "staff_role_mismatch";
    req.rData = { staffRole: staff.role, requestedRole: role };
    return next();
  }

  if (String(staff.providerId) !== String(ambulance.providerId)) {
    req.rCode = 0;
    req.msg = "staff_provider_mismatch";
    req.rData = {};
    return next();
  }

  const field = role === "driver" ? "assignedDriverId" : "assignedAttendantId";

  try {
    const updated = await Ambulance.findByIdAndUpdate(
      (req.params.id as string),
      { [field]: staff._id },
      { returnDocument: "after" },
    );
    req.rData = { ambulance: updated };
    req.msg = "ambulance_assigned";
    return next();
  } catch (err: any) {
    if (err && err.code === 11000) {
      req.rCode = 0;
      res.status(409);
      req.msg = "staff_already_assigned_elsewhere";
      req.rData = {};
      return next();
    }
    throw err;
  }
};

export const unassign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { role } = req.body as { role: "driver" | "attendant" };
  const field = role === "driver" ? "assignedDriverId" : "assignedAttendantId";
  const updated = await Ambulance.findByIdAndUpdate(
    (req.params.id as string),
    { [field]: null },
    { returnDocument: "after" },
  );
  if (!updated) {
    req.rCode = 5;
    req.msg = "ambulance_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { ambulance: updated };
  req.msg = "ambulance_unassigned";
  next();
};

export const softDelete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const ambulance = await Ambulance.findById(req.params.id);
  if (!ambulance) {
    req.rCode = 5;
    req.msg = "ambulance_not_found";
    req.rData = {};
    return next();
  }
  if (ambulance.status === "on_dispatch") {
    req.rCode = 0;
    req.msg = "ambulance_on_active_dispatch";
    req.rData = {};
    return next();
  }
  ambulance.isActive = false;
  ambulance.status = "offline";
  ambulance.assignedDriverId = null;
  ambulance.assignedAttendantId = null;
  await ambulance.save();
  req.rData = { ambulance };
  req.msg = "ambulance_deleted";
  next();
};
