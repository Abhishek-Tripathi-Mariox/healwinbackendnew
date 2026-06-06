import { Request, Response } from "express";
import Booking from "../../models/booking.model";
import User from "../../models/Users";
import Driver from "../../models/driver.model";
import { SupportTicket } from "../../models/support-ticket.model";

/**
 * Get dashboard stats
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  // Parallel queries for efficiency
  const [
    totalBookings,
    todayBookings,
    monthBookings,
    lastMonthBookings,
    completedBookings,
    cancelledBookings,
    totalRevenue,
    monthRevenue,
    lastMonthRevenue,
    totalUsers,
    newUsersToday,
    newUsersMonth,
    totalDrivers,
    approvedDrivers,
    onlineDrivers,
    pendingVerifications,
    openTickets,
    bookingsByStatus,
  ] = await Promise.all([
    Booking.countDocuments(),
    Booking.countDocuments({ createdAt: { $gte: today } }),
    Booking.countDocuments({ createdAt: { $gte: thisMonth } }),
    Booking.countDocuments({
      createdAt: { $gte: lastMonth, $lt: thisMonth },
    }),
    Booking.countDocuments({ status: "COMPLETED" }),
    Booking.countDocuments({ status: "CANCELLED" }),
    Booking.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$finalFare" } } },
    ]),
    Booking.aggregate([
      { $match: { status: "COMPLETED", createdAt: { $gte: thisMonth } } },
      { $group: { _id: null, total: { $sum: "$finalFare" } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          status: "COMPLETED",
          createdAt: { $gte: lastMonth, $lt: thisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$finalFare" } } },
    ]),
    User.countDocuments({ isDeleted: false }),
    User.countDocuments({ createdAt: { $gte: today } }),
    User.countDocuments({ createdAt: { $gte: thisMonth } }),
    Driver.countDocuments({ isDeleted: false }),
    Driver.countDocuments({ isDeleted: false, status: "approved" }),
    Driver.countDocuments({
      isDeleted: false,
      status: "approved",
      isOnline: true,
    }),
    Driver.countDocuments({
      isDeleted: false,
      status: { $in: ["documents_uploaded", "under_verification"] },
    }),
    SupportTicket.countDocuments({ status: { $in: ["OPEN", "IN_PROGRESS"] } }),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  // Calculate growth percentages
  const bookingGrowth =
    lastMonthBookings > 0
      ? (
          ((monthBookings - lastMonthBookings) / lastMonthBookings) *
          100
        ).toFixed(1)
      : 0;

  const currentMonthRevenue = monthRevenue[0]?.total || 0;
  const previousMonthRevenue = lastMonthRevenue[0]?.total || 0;
  const revenueGrowth =
    previousMonthRevenue > 0
      ? (
          ((currentMonthRevenue - previousMonthRevenue) /
            previousMonthRevenue) *
          100
        ).toFixed(1)
      : 0;

  res.locals.data = {
    bookings: {
      total: totalBookings,
      today: todayBookings,
      thisMonth: monthBookings,
      completed: completedBookings,
      cancelled: cancelledBookings,
      growth: `${Number(bookingGrowth) >= 0 ? "+" : ""}${bookingGrowth}%`,
      byStatus: bookingsByStatus,
    },
    revenue: {
      total: totalRevenue[0]?.total || 0,
      thisMonth: currentMonthRevenue,
      growth: `${Number(revenueGrowth) >= 0 ? "+" : ""}${revenueGrowth}%`,
    },
    users: {
      total: totalUsers,
      newToday: newUsersToday,
      newThisMonth: newUsersMonth,
    },
    drivers: {
      total: totalDrivers,
      approved: approvedDrivers,
      online: onlineDrivers,
      pendingVerification: pendingVerifications,
    },
    support: {
      openTickets,
    },
  };
};

/**
 * Get booking reports
 */
export const getBookingReports = async (req: Request, res: Response) => {
  const { dateFrom, dateTo, groupBy = "day" } = req.query;

  const startDate = dateFrom
    ? new Date(dateFrom as string)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = dateTo ? new Date(dateTo as string) : new Date();

  let dateFormat: string;
  switch (groupBy) {
    case "hour":
      dateFormat = "%Y-%m-%d %H:00";
      break;
    case "week":
      dateFormat = "%Y-W%V";
      break;
    case "month":
      dateFormat = "%Y-%m";
      break;
    default:
      dateFormat = "%Y-%m-%d";
  }

  const bookingTrend = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: dateFormat, date: "$createdAt" } },
          status: "$status",
        },
        count: { $sum: 1 },
        revenue: { $sum: "$finalFare" },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);

  const vehicleTypeBreakdown = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: "vehicletypes",
        localField: "vehicleTypeId",
        foreignField: "_id",
        as: "vehicleType",
      },
    },
    {
      $group: {
        _id: { $arrayElemAt: ["$vehicleType.name", 0] },
        count: { $sum: 1 },
        revenue: { $sum: "$finalFare" },
      },
    },
  ]);

  res.locals.data = {
    dateRange: { from: startDate, to: endDate },
    bookingTrend,
    vehicleTypeBreakdown,
  };
};

/**
 * Get revenue reports
 */
export const getRevenueReports = async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const startDate = dateFrom
    ? new Date(dateFrom as string)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = dateTo ? new Date(dateTo as string) : new Date();

  const revenueBreakdown = await Booking.aggregate([
    {
      $match: {
        status: "COMPLETED",
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        totalRevenue: { $sum: "$finalFare" },
        totalGST: { $sum: "$gstAmount" },
        totalDiscount: { $sum: "$totalDiscount" },
        bookingCount: { $sum: 1 },
        avgFare: { $avg: "$finalFare" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const paymentMethodBreakdown = await Booking.aggregate([
    {
      $match: {
        status: "COMPLETED",
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        total: { $sum: "$finalFare" },
      },
    },
  ]);

  res.locals.data = {
    dateRange: { from: startDate, to: endDate },
    daily: revenueBreakdown,
    byPaymentMethod: paymentMethodBreakdown,
  };
};

/**
 * Get user reports
 */
export const getUserReports = async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const startDate = dateFrom
    ? new Date(dateFrom as string)
    : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  const endDate = dateTo ? new Date(dateTo as string) : new Date();

  const userGrowth = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top users by bookings
  const topUsers = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$userId",
        bookingCount: { $sum: 1 },
        totalSpent: { $sum: "$finalFare" },
      },
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $project: {
        user: { $arrayElemAt: ["$user", 0] },
        bookingCount: 1,
        totalSpent: 1,
      },
    },
  ]);

  res.locals.data = {
    growth: userGrowth,
    topUsers,
  };
};

/**
 * Get driver reports
 */
export const getDriverReports = async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.query;

  const startDate = dateFrom
    ? new Date(dateFrom as string)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  const endDate = dateTo ? new Date(dateTo as string) : new Date();

  // Top drivers by earnings
  const topDrivers = await Booking.aggregate([
    {
      $match: {
        status: "COMPLETED",
        createdAt: { $gte: startDate, $lte: endDate },
        driverId: { $exists: true },
      },
    },
    {
      $group: {
        _id: "$driverId",
        tripCount: { $sum: 1 },
        totalEarnings: { $sum: "$finalFare" },
        avgRating: { $avg: "$rating" },
      },
    },
    { $sort: { totalEarnings: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "drivers",
        localField: "_id",
        foreignField: "_id",
        as: "driver",
      },
    },
    {
      $project: {
        driver: { $arrayElemAt: ["$driver", 0] },
        tripCount: 1,
        totalEarnings: 1,
        avgRating: 1,
      },
    },
  ]);

  // Driver status distribution
  const statusDistribution = await Driver.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  res.locals.data = {
    topDrivers,
    statusDistribution,
  };
};
