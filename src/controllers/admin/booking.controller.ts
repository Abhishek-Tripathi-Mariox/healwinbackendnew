import { Request, Response } from "express";
import Booking from "../../models/booking.model";
import User from "../../models/Users";
import Driver from "../../models/driver.model";
import { Types } from "mongoose";

/**
 * Get all bookings with filters
 */
export const getAllBookings = async (req: Request, res: Response) => {
  const {
    status,
    paymentStatus,
    serviceType,
    dateFrom,
    dateTo,
    search,
    page = 0,
    limit = 20,
  } = req.query;

  const query: any = {};

  if (status) query.status = status;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (serviceType) query.serviceType = serviceType;

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
    if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
  }

  if (search) {
    query.$or = [
      { bookingNumber: { $regex: search, $options: "i" } },
      { "pickup.address": { $regex: search, $options: "i" } },
      { "drop.address": { $regex: search, $options: "i" } },
    ];
  }

  const bookings = await Booking.find(query)
    .populate("userId", "fullName mobileNumber")
    .populate("driverId", "fullName mobileNumber vehicleNumber")
    .populate("vehicleTypeId", "name")
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await Booking.countDocuments(query);

  res.locals.data = {
    bookings,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
};

/**
 * Get booking by ID
 */
export const getBookingById = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;

  const booking = await Booking.findById(id)
    .populate("userId", "fullName mobileNumber email profileImage")
    .populate("driverId", "fullName mobileNumber email rating")
    .populate("vehicleTypeId")
    .populate("promoCodeId")
    .populate("invoiceId");

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  res.locals.data = { booking };
};

/**
 * Cancel booking (Admin)
 */
export const cancelBooking = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const { reason, refundAmount } = req.body;

  const booking = await Booking.findById(id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  if (["COMPLETED", "CANCELLED"].includes(booking.status)) {
    return res.status(400).json({
      success: false,
      message: "Cannot cancel this booking",
    });
  }

  booking.status = "CANCELLED";
  booking.cancelledBy = "SYSTEM";
  booking.cancellationReason = reason || "Cancelled by admin";
  booking.cancelledAt = new Date();
  booking.refundAmount = refundAmount || 0;
  booking.refundStatus = refundAmount > 0 ? "PENDING" : "NONE";

  await booking.save();

  // TODO: Send notification to user and driver

  res.locals.data = {
    message: "Booking cancelled successfully",
    booking,
  };
};

/**
 * Process refund
 */
export const processRefund = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const { amount, reason } = req.body;

  const booking = await Booking.findById(id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  if (booking.refundStatus === "PROCESSED") {
    return res.status(400).json({
      success: false,
      message: "Refund already processed",
    });
  }

  // TODO: Process actual refund via payment gateway
  // For now, just update status

  booking.refundAmount = amount;
  booking.refundStatus = "PROCESSED";
  await booking.save();

  res.locals.data = {
    message: "Refund processed successfully",
    refundAmount: amount,
  };
};

/**
 * Get booking stats
 */
export const getBookingStats = async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const matchStage: any = {};
  if (dateFrom || dateTo) {
    matchStage.createdAt = {};
    if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom as string);
    if (dateTo) matchStage.createdAt.$lte = new Date(dateTo as string);
  }

  const stats = await Booking.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalFare: { $sum: "$finalFare" },
      },
    },
  ]);

  const dailyStats = await Booking.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        count: { $sum: 1 },
        revenue: { $sum: "$finalFare" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.locals.data = { stats, dailyStats };
};

/**
 * List drivers available for manual assignment (approved, not deleted).
 * Powers the "Assign driver" picker on the admin Booking Management page.
 */
export const getAvailableDrivers = async (_req: Request, res: Response) => {
  const drivers = await Driver.find({ isDeleted: false, status: "approved" })
    .select("fullName mobileNumber vehicleNumber isOnline currentBookingId")
    .sort({ fullName: 1 })
    .limit(300);

  res.locals.data = { drivers };
};

/**
 * Assign driver manually
 */
export const assignDriver = async (req: Request, res: Response) => {
  const { id } = req.params as Record<string, string>;
  const { driverId } = req.body;

  const booking = await Booking.findById(id);
  const driver = await Driver.findById(driverId);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: "Booking not found",
    });
  }

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }

  if (booking.status !== "SEARCHING") {
    return res.status(400).json({
      success: false,
      message: "Booking is not in searching status",
    });
  }

  booking.driverId = new Types.ObjectId(driverId);
  booking.status = "ASSIGNED";
  booking.assignedAt = new Date();
  await booking.save();

  // Update driver status
  driver.currentBookingId = booking._id as Types.ObjectId;
  await driver.save();

  res.locals.data = {
    message: "Driver assigned successfully",
    booking,
  };
};
