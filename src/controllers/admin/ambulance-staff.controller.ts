import { Request, Response, NextFunction } from "express";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import Ambulance from "../../models/ambulance.model";
import { EmergencyDispatch } from "../../models/emergency-dispatch.model";

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = req.adminId;
  const staff = await AmbulanceStaff.create({
    ...req.body,
    createdByAdminId: adminId,
    isActive: true,
    isDeleted: false,
  });
  req.rData = { staff };
  req.msg = "staff_created";
  next();
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const {
    providerId,
    role,
    isActive,
    isOnline,
    search,
    affiliation,
    page = "1",
    limit = "20",
  } = req.query as any;
  const filter: any = { isDeleted: false };
  if (providerId) filter.providerId = providerId;
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (isOnline !== undefined) filter.isOnline = isOnline === "true";
  // Ambulance staff (drivers + on-vehicle attendants) belong to a
  // provider; hospital staff belong to a hospital. Same collection,
  // mutually exclusive (`providerId` XOR `hospitalId`). The admin's
  // "Ambulance Staff" page passes affiliation=provider so hospital
  // paramedics don't leak into the fleet list — and a future Hospital
  // Staff page can pass affiliation=hospital for the inverse view.
  if (affiliation === "provider") {
    filter.providerId = filter.providerId || { $ne: null };
  } else if (affiliation === "hospital") {
    filter.hospitalId = { $ne: null };
  }
  if (search) {
    const s = String(search);
    filter.$or = [
      { fullName: { $regex: s, $options: "i" } },
      { mobileNumber: { $regex: s, $options: "i" } },
    ];
  }

  const pg = Math.max(1, parseInt(page as string, 10));
  const lim = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

  const [items, total] = await Promise.all([
    AmbulanceStaff.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate("providerId", "name")
      .lean(),
    AmbulanceStaff.countDocuments(filter),
  ]);

  req.rData = { items, total, page: pg, limit: lim };
  req.msg = "staff_listed";
  next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staff = await AmbulanceStaff.findById(req.params.id)
    .populate("providerId", "name")
    .populate("hospitalId", "name")
    .lean();
  if (!staff || staff.isDeleted) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  const ambulance = await Ambulance.findOne({
    $or: [
      { assignedDriverId: staff._id },
      { assignedAttendantId: staff._id },
    ],
  })
    .populate("providerId", "name")
    .lean();

  // Last 10 dispatches this staff was part of (either seat). Useful for
  // the detail page activity timeline — "is this driver actually getting
  // called out?". Cheap query because EmergencyDispatch has indexes on
  // both driverStaffId and attendantStaffId.
  const recentDispatches = await EmergencyDispatch.find({
    $or: [
      { driverStaffId: staff._id },
      { attendantStaffId: staff._id },
    ],
  })
    .sort({ dispatchedAt: -1 })
    .limit(10)
    .populate("ambulanceId", "registrationNumber ambulanceType")
    .lean();

  req.rData = {
    staff,
    assignedAmbulance: ambulance,
    recentDispatches,
  };
  req.msg = "staff_detail";
  next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staff = await AmbulanceStaff.findOneAndUpdate(
    { _id: (req.params.id as string), isDeleted: false },
    req.body,
    { returnDocument: "after" },
  );
  if (!staff) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { staff };
  req.msg = "staff_updated";
  next();
};

export const deactivate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staff = await AmbulanceStaff.findOneAndUpdate(
    { _id: (req.params.id as string), isDeleted: false },
    { isActive: false, isOnline: false, isDutyOn: false },
    { returnDocument: "after" },
  );
  if (!staff) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  // Unassign from any ambulance
  await Ambulance.updateMany(
    { assignedDriverId: staff._id },
    { assignedDriverId: null },
  );
  await Ambulance.updateMany(
    { assignedAttendantId: staff._id },
    { assignedAttendantId: null },
  );
  req.rData = { staff };
  req.msg = "staff_deactivated";
  next();
};

export const softDelete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staff = await AmbulanceStaff.findOneAndUpdate(
    { _id: (req.params.id as string), isDeleted: false },
    {
      isDeleted: true,
      isActive: false,
      isOnline: false,
      isDutyOn: false,
    },
    { returnDocument: "after" },
  );
  if (!staff) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  await Ambulance.updateMany(
    { assignedDriverId: staff._id },
    { assignedDriverId: null },
  );
  await Ambulance.updateMany(
    { assignedAttendantId: staff._id },
    { assignedAttendantId: null },
  );
  req.rData = { staff };
  req.msg = "staff_deleted";
  next();
};
