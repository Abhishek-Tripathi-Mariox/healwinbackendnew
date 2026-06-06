import { Request, Response } from "express";
import Driver from "../../models/driver.model";
import DriverKYC from "../../models/driver-kyc.model";
import DriverVehicle from "../../models/driver-vehicle.model";
import Booking from "../../models/booking.model";
import VehicleType from "../../models/vehicle-type.model";

/**
 * Get all drivers with filters
 */
export const getAllDrivers = async (req: Request, res: Response) => {
  const {
    status,
    isOnline,
    search,
    dateFrom,
    dateTo,
    page = 0,
    limit = 20,
  } = req.query;

  const query: any = { isDeleted: false };

  if (status) query.status = status;
  if (isOnline !== undefined) query.isOnline = isOnline === "true";

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
    if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
  }

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { mobileNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const drivers = await Driver.find(query)
    .select("-__v")
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await Driver.countDocuments(query);

  // Get additional stats
  const driversWithStats = await Promise.all(
    drivers.map(async (driver) => {
      const completedTrips = await Booking.countDocuments({
        driverId: driver._id,
        status: "COMPLETED",
      });
      const earnings = await Booking.aggregate([
        { $match: { driverId: driver._id, status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$finalFare" } } },
      ]);
      return {
        ...driver.toObject(),
        completedTrips,
        totalEarnings: earnings[0]?.total || 0,
      };
    }),
  );

  res.locals.data = {
    drivers: driversWithStats,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

/**
 * Get pending verifications
 */
export const getPendingVerifications = async (req: Request, res: Response) => {
  const drivers = await Driver.find({
    isDeleted: false,
    status: { $in: ["documents_uploaded", "under_verification"] },
  })
    .select("fullName mobileNumber email status createdAt")
    .sort({ createdAt: 1 }); // Oldest first

  res.locals.data = { drivers, total: drivers.length };
};

/**
 * Get driver by ID
 */
export const getDriverById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const driver = await Driver.findById(id);

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  // Get KYC documents
  const kyc = await DriverKYC.findOne({ driverId: id });

  // Get vehicles
  const vehicles = await DriverVehicle.find({ driverId: id });

  // Get booking stats
  const bookingStats = await Booking.aggregate([
    { $match: { driverId: driver._id } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalEarnings: { $sum: "$finalFare" },
      },
    },
  ]);

  res.locals.data = {
    driver,
    kyc,
    vehicles,
    bookingStats,
  };
};

/**
 * Verify driver (Approve/Reject)
 */
export const verifyDriver = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, rejectionReason } = req.body;

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Invalid action. Use 'approve' or 'reject'",
    });
  }

  const driver = await Driver.findById(id);

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  if (action === "approve") {
    driver.status = "approved";
    driver.rejectionReason = undefined;
  } else {
    driver.status = "rejected";
    driver.rejectionReason = rejectionReason || "Documents verification failed";
  }

  await driver.save();

  // TODO: Send notification to driver

  res.locals.data = {
    message: `Driver ${action === "approve" ? "approved" : "rejected"} successfully`,
    driver,
  };
};

/**
 * Update driver status
 */
export const updateDriverStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const validStatuses = [
    "draft",
    "documents_uploaded",
    "vehicle_added",
    "under_verification",
    "approved",
    "rejected",
    "suspended",
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  const update: any = { status };
  if (status === "suspended") {
    update.suspensionReason = reason;
  } else if (status === "rejected") {
    update.rejectionReason = reason;
  }

  const driver = await Driver.findByIdAndUpdate(id, update, { returnDocument: "after" });

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  res.locals.data = {
    message: `Driver status updated to ${status}`,
    driver,
  };
};

/**
 * Get driver documents
 */
export const getDriverDocuments = async (req: Request, res: Response) => {
  const { id } = req.params;

  const kyc = await DriverKYC.findOne({ driverId: id });

  if (!kyc) {
    return res.status(404).json({
      success: false,
      message: "Documents not found",
    });
  }

  res.locals.data = { documents: kyc };
};

/**
 * Get driver stats summary
 */
export const getDriverStats = async (req: Request, res: Response) => {
  const stats = await Driver.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const onlineCount = await Driver.countDocuments({
    isDeleted: false,
    status: "approved",
    isOnline: true,
  });

  res.locals.data = {
    byStatus: stats,
    onlineDrivers: onlineCount,
  };
};

/**
 * Update driver profile
 */
export const updateDriver = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    fullName,
    email,
    gender,
    dob,
    bloodGroup,
    district,
    state,
    languages,
  } = req.body;

  const driver = await Driver.findByIdAndUpdate(
    id,
    { fullName, email, gender, dob, bloodGroup, district, state, languages },
    { returnDocument: "after" },
  );

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  res.locals.data = {
    message: "Driver updated successfully",
    driver,
  };
};

/**
 * Update bank details
 */
export const updateBankDetails = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { accountHolderName, bankName, accountNumber, ifscCode } = req.body;

  const driver = await Driver.findByIdAndUpdate(
    id,
    {
      bankDetails: {
        accountHolderName,
        bankName,
        accountNumber,
        ifscCode,
        isVerified: false,
      },
    },
    { returnDocument: "after" },
  );

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  res.locals.data = {
    message: "Bank details updated successfully",
    driver,
  };
};

/**
 * Verify bank details
 */
export const verifyBankDetails = async (req: Request, res: Response) => {
  const { id } = req.params;

  const driver = await Driver.findByIdAndUpdate(
    id,
    { "bankDetails.isVerified": true },
    { returnDocument: "after" },
  );

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  res.locals.data = {
    message: "Bank details verified successfully",
    driver,
  };
};

/**
 * Get driver vehicles
 */
export const getDriverVehicles = async (req: Request, res: Response) => {
  const { id } = req.params;

  const vehicles = await DriverVehicle.find({ driverId: id, isDeleted: false })
    .populate("vehicleTypeId", "name icon maxWeightKg")
    .lean();

  res.locals.data = { vehicles };
};

/**
 * Delete driver (soft delete)
 */
export const deleteDriver = async (req: Request, res: Response) => {
  const { id } = req.params;

  const driver = await Driver.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
      isOnline: false,
    },
    { returnDocument: "after" },
  );

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  res.locals.data = {
    message: "Driver deleted successfully",
    driver,
  };
};

/**
 * Restore deleted driver
 */
export const restoreDriver = async (req: Request, res: Response) => {
  const { id } = req.params;

  const driver = await Driver.findByIdAndUpdate(
    id,
    { isDeleted: false, deletedAt: null, isActive: true },
    { returnDocument: "after" },
  );

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  res.locals.data = {
    message: "Driver restored successfully",
    driver,
  };
};

/**
 * Get driver bookings
 */
export const getDriverBookings = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 0, limit = 20 } = req.query;

  const bookings = await Booking.find({ driverId: id })
    .populate("userId", "fullName mobileNumber")
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit))
    .lean();

  const total = await Booking.countDocuments({ driverId: id });

  res.locals.data = {
    bookings,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

/**
 * Get driver earnings
 */
export const getDriverEarnings = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;

  const matchQuery: any = { driverId: id, status: "COMPLETED" };

  if (dateFrom || dateTo) {
    matchQuery.createdAt = {};
    if (dateFrom) matchQuery.createdAt.$gte = new Date(dateFrom as string);
    if (dateTo) matchQuery.createdAt.$lte = new Date(dateTo as string);
  }

  const earnings = await Booking.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: "$driverEarnings" },
        totalTrips: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
      },
    },
  ]);

  const dailyEarnings = await Booking.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        earnings: { $sum: "$driverEarnings" },
        trips: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 30 },
  ]);

  res.locals.data = {
    summary: earnings[0] || {
      totalEarnings: 0,
      totalTrips: 0,
      totalDistance: 0,
    },
    dailyEarnings,
  };
};
