import { Request, Response } from "express";
import Booking from "../../models/booking.model";
import User from "../../models/Users";
import Driver from "../../models/driver.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { SupportTicket } from "../../models/support-ticket.model";

/**
 * The real ride business lives in `AmbulanceRequest` (collection
 * `ambulancerequests`, revenue in `amount`, crew in `driverStaffId`), NOT the
 * legacy `Booking` collection. Reports therefore $unionWith the ambulance
 * requests so totals reflect actual activity. These helpers project an
 * ambulance request into the same shape the Booking pipelines use.
 */
const AMB_COLL = "ambulancerequests";

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

  const dateMatch = { createdAt: { $gte: startDate, $lte: endDate } };

  // Trend across BOTH legacy bookings and real ambulance requests.
  const bookingTrend = await Booking.aggregate([
    { $match: dateMatch },
    { $project: { createdAt: 1, status: 1, rev: "$finalFare" } },
    {
      $unionWith: {
        coll: AMB_COLL,
        pipeline: [
          { $match: dateMatch },
          { $project: { createdAt: 1, status: 1, rev: "$amount" } },
        ],
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: dateFormat, date: "$createdAt" } },
          status: "$status",
        },
        count: { $sum: 1 },
        revenue: { $sum: "$rev" },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);

  const vehicleTypeBreakdown = await Booking.aggregate([
    { $match: dateMatch },
    { $project: { vehicleTypeId: 1, rev: "$finalFare" } },
    {
      $unionWith: {
        coll: AMB_COLL,
        pipeline: [
          { $match: dateMatch },
          { $project: { vehicleTypeId: 1, rev: "$amount" } },
        ],
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
        revenue: { $sum: "$rev" },
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

  const completedMatch = {
    status: "COMPLETED",
    createdAt: { $gte: startDate, $lte: endDate },
  };

  const revenueBreakdown = await Booking.aggregate([
    { $match: completedMatch },
    {
      $project: {
        createdAt: 1,
        rev: "$finalFare",
        gst: "$gstAmount",
        disc: "$totalDiscount",
      },
    },
    {
      $unionWith: {
        coll: AMB_COLL,
        pipeline: [
          { $match: completedMatch },
          {
            $project: {
              createdAt: 1,
              rev: "$amount",
              // GST/discount live inside the ambulance fare breakdown.
              gst: { $ifNull: ["$fareBreakdown.gstAmount", 0] },
              disc: { $ifNull: ["$fareBreakdown.totalDiscount", 0] },
            },
          },
        ],
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        totalRevenue: { $sum: "$rev" },
        totalGST: { $sum: "$gst" },
        totalDiscount: { $sum: "$disc" },
        bookingCount: { $sum: 1 },
        avgFare: { $avg: "$rev" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const paymentMethodBreakdown = await Booking.aggregate([
    { $match: completedMatch },
    { $project: { pm: { $ifNull: ["$paymentMethod", "OTHER"] }, rev: "$finalFare" } },
    {
      $unionWith: {
        coll: AMB_COLL,
        pipeline: [
          { $match: completedMatch },
          // Ambulance requests have no payment method — bucket them as AMBULANCE.
          { $project: { pm: "AMBULANCE", rev: "$amount" } },
        ],
      },
    },
    {
      $group: {
        _id: "$pm",
        count: { $sum: 1 },
        total: { $sum: "$rev" },
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

  // Top users by spend across legacy bookings + real ambulance requests.
  const userDateMatch = { createdAt: { $gte: startDate, $lte: endDate } };
  const topUsers = await Booking.aggregate([
    { $match: userDateMatch },
    { $project: { userId: 1, spent: "$finalFare" } },
    {
      $unionWith: {
        coll: AMB_COLL,
        pipeline: [
          { $match: userDateMatch },
          { $project: { userId: 1, spent: "$amount" } },
        ],
      },
    },
    {
      $group: {
        _id: "$userId",
        bookingCount: { $sum: 1 },
        totalSpent: { $sum: "$spent" },
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

  // Top drivers by earnings — merge legacy ride drivers (Booking → Driver) with
  // ambulance crew (AmbulanceRequest → AmbulanceStaff), since real trips run on
  // the ambulance fleet. They're different collections, so rank both and merge.
  const [legacyDrivers, ambulanceDrivers] = await Promise.all([
    Booking.aggregate([
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
      { $lookup: { from: "drivers", localField: "_id", foreignField: "_id", as: "driver" } },
      {
        $project: {
          driver: { $arrayElemAt: ["$driver", 0] },
          tripCount: 1,
          totalEarnings: 1,
          avgRating: 1,
          fleet: "DRIVER",
        },
      },
    ]),
    Booking.db.collection(AMB_COLL).aggregate([
      {
        $match: {
          status: "COMPLETED",
          createdAt: { $gte: startDate, $lte: endDate },
          driverStaffId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$driverStaffId",
          tripCount: { $sum: 1 },
          totalEarnings: { $sum: "$amount" },
        },
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 },
      { $lookup: { from: "ambulancestaffs", localField: "_id", foreignField: "_id", as: "staff" } },
      {
        $project: {
          driver: { $arrayElemAt: ["$staff", 0] },
          tripCount: 1,
          totalEarnings: 1,
          avgRating: null,
          fleet: "AMBULANCE",
        },
      },
    ]).toArray(),
  ]);

  const topDrivers = [...legacyDrivers, ...ambulanceDrivers]
    .sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0))
    .slice(0, 10);

  // Status distribution: legacy driver statuses + the ambulance fleet (active
  // crew counted as "approved" so headcount/Approved reflect the real fleet).
  const [driverStatuses, ambActive, ambInactive] = await Promise.all([
    Driver.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    AmbulanceStaff.countDocuments({ isDeleted: false, isActive: true }),
    AmbulanceStaff.countDocuments({ isDeleted: false, isActive: false }),
  ]);
  const statusMap = new Map<string, number>();
  for (const s of driverStatuses) statusMap.set(s._id || "unknown", s.count);
  if (ambActive) statusMap.set("approved", (statusMap.get("approved") || 0) + ambActive);
  if (ambInactive) statusMap.set("suspended", (statusMap.get("suspended") || 0) + ambInactive);
  const statusDistribution = Array.from(statusMap, ([_id, count]) => ({ _id, count }));

  res.locals.data = {
    topDrivers,
    statusDistribution,
  };
};
