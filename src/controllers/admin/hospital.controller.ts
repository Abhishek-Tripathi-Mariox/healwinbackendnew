import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Centre from "../../models/centre.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";

/**
 * Hospital management — admin-facing surface for Centre rows that serve
 * as the employing hospital for ambulance attendants (paramedics, MTs).
 *
 * Centres are owned by the Centre Locator module. This controller does
 * NOT create / edit centres — it only:
 *   1. lists them (so the admin can pick one)
 *   2. exposes the attendant roster under each centre via its
 *      hospitalId link on AmbulanceStaff
 *   3. lets the admin assign / reassign / remove attendants for that
 *      hospital
 */

export const listHospitals = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const {
    search,
    state,
    district,
    type,
    page = "1",
    limit = "50",
  } = req.query as Record<string, string | undefined>;

  const filter: any = { isActive: true };
  if (state) filter.state = state;
  if (district) filter.district = district;
  if (type) filter.type = type;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
    ];
  }

  const pg = Math.max(1, parseInt(page, 10));
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10)));

  const [items, total] = await Promise.all([
    Centre.find(filter)
      .sort({ name: 1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate("state", "name code")
      .populate("district", "name")
      .lean(),
    Centre.countDocuments(filter),
  ]);

  // For the list view, also include a quick "staff count" per hospital so
  // the admin can see at-a-glance which hospitals are understaffed
  // without drilling in.
  const ids = items.map((c) => c._id);
  const counts = await AmbulanceStaff.aggregate([
    {
      $match: {
        hospitalId: { $in: ids },
        isActive: true,
        isDeleted: false,
      },
    },
    { $group: { _id: "$hospitalId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  const enriched = items.map((c: any) => ({
    ...c,
    staffCount: countMap.get(String(c._id)) ?? 0,
  }));

  req.rData = { items: enriched, total, page: pg, limit: lim };
  req.msg = "hospitals_listed";
  next();
};

export const hospitalDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const hospital = await Centre.findById(req.params.id)
    .populate("state", "name code")
    .populate("district", "name")
    .lean();
  if (!hospital || !(hospital as any).isActive) {
    req.rCode = 5;
    req.msg = "hospital_not_found";
    req.rData = {};
    return next();
  }
  const staff = await AmbulanceStaff.find({
    hospitalId: hospital._id,
    isActive: true,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .select("fullName mobileNumber role gender email isOnline isDutyOn lastSeenAt")
    .lean();
  req.rData = { hospital, staff };
  req.msg = "hospital_detail";
  next();
};

export const listHospitalStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { role, isActive, search } = req.query as Record<string, string | undefined>;
  const filter: any = {
    hospitalId: req.params.id,
    isDeleted: false,
  };
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { mobileNumber: { $regex: search, $options: "i" } },
    ];
  }
  const items = await AmbulanceStaff.find(filter)
    .sort({ createdAt: -1 })
    .populate("providerId", "name")
    .lean();
  req.rData = { items, total: items.length };
  req.msg = "hospital_staff_listed";
  next();
};

/**
 * Create a new staff member directly under a hospital. Forces role to
 * "attendant" (drivers stay under Service Providers) and forces
 * providerId to null — attendants are employed by hospitals, not by
 * ambulance operators. The model's mutual-exclusion validator rejects
 * rows that try to keep both links.
 */
export const createHospitalStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const hospitalId = req.params.id;
  const hospital = await Centre.findById(hospitalId).lean();
  if (!hospital) {
    req.rCode = 5;
    req.msg = "hospital_not_found";
    req.rData = {};
    return next();
  }
  const body = req.body || {};
  if (!body.fullName || !body.mobileNumber) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "fullName and mobileNumber are required",
    };
    return next();
  }
  // Strip provider / role / hospitalId from the request body so the
  // client can't bypass the employer rule. We set them explicitly below.
  const {
    providerId: _ignoredProvider,
    role: _ignoredRole,
    hospitalId: _ignoredHospital,
    ...rest
  } = body;
  void _ignoredProvider;
  void _ignoredRole;
  void _ignoredHospital;
  const staff = await AmbulanceStaff.create({
    ...rest,
    role: "attendant",
    providerId: null,
    hospitalId,
    createdByAdminId: adminId,
    isActive: true,
    isDeleted: false,
  });
  req.rData = { staff };
  req.msg = "hospital_staff_created";
  next();
};

/**
 * Assign an existing staff member to this hospital. Used when admin
 * wants to move an attendant between hospitals without recreating the
 * row. Driver-role staff can't be assigned to a hospital — that's a
 * data-integrity rule we enforce here.
 */
export const assignStaffToHospital = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const hospitalId = req.params.id;
  const { staffId } = req.body || {};
  if (!staffId) {
    req.rCode = 0;
    req.msg = "staff_id_required";
    req.rData = {};
    return next();
  }
  const staff = await AmbulanceStaff.findById(staffId);
  if (!staff || staff.isDeleted) {
    req.rCode = 5;
    req.msg = "staff_not_found";
    req.rData = {};
    return next();
  }
  if (staff.role !== "attendant") {
    req.rCode = 0;
    req.msg = "only_attendants_can_be_hospital_staff";
    req.rData = { role: staff.role };
    return next();
  }
  // Switching employers — clear the provider link so the
  // mutual-exclusion invariant (provider XOR hospital) holds.
  staff.providerId = null;
  staff.hospitalId = new Types.ObjectId(hospitalId);
  await staff.save();
  req.rData = { staff };
  req.msg = "staff_assigned_to_hospital";
  next();
};

/**
 * Remove a staff member from this hospital. Does NOT delete the staff
 * row — that's still managed by the existing /admin/ambulance-staff
 * endpoint. This just clears the hospital association.
 */
export const removeStaffFromHospital = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const hospitalId = req.params.id;
  const staffId = req.params.staffId;
  const staff = await AmbulanceStaff.findById(staffId);
  if (!staff || String(staff.hospitalId) !== String(hospitalId)) {
    req.rCode = 5;
    req.msg = "staff_not_in_hospital";
    req.rData = {};
    return next();
  }
  staff.hospitalId = null;
  await staff.save();
  req.rData = { staff };
  req.msg = "staff_removed_from_hospital";
  next();
};
