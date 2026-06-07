import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import DriverModel from "../models/driver.model";
import DriverVehicleModel from "../models/driver-vehicle.model";
import BookingModel from "../models/booking.model";
import WalletModel from "../models/wallet.model";
import WalletTransactionModel from "../models/wallet-transaction.model";
import * as DriverLocationService from "../services/driver-location.service";
import * as BookingDispatchService from "../services/booking-dispatch.service";
import * as fileUploadService from "../utils/s3";
import { getIO } from "../utils/socket.util";

// =====================
// PROFILE
// =====================

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver = await DriverModel.findById(driverId).select("-__v").lean();

    if (!driver) {
      req.rCode = 0;
      req.msg = "driver_not_found";
      return next();
    }

    // Get statistics
    const bookingStats = await BookingModel.aggregate([
      {
        $match: { driverId: new Types.ObjectId(driverId), status: "COMPLETED" },
      },
      {
        $group: {
          _id: null,
          totalTrips: { $sum: 1 },
          totalEarnings: { $sum: "$fare" },
          totalDistance: { $sum: "$distanceKm" },
        },
      },
    ]);

    const stats = bookingStats[0] || {
      totalTrips: 0,
      totalEarnings: 0,
      totalDistance: 0,
    };

    req.rData = {
      ...driver,
      stats: {
        totalTrips: stats.totalTrips,
        totalEarnings: stats.totalEarnings,
        totalDistance: Math.round(stats.totalDistance * 100) / 100,
      },
    };
    req.msg = "profile_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { fullName, email, gender, dob, bloodGroup, languages } = req.body;

    const driver = await DriverModel.findByIdAndUpdate(
      driverId,
      {
        ...(fullName && { fullName }),
        ...(email && { email }),
        ...(gender && { gender }),
        ...(dob && { dob }),
        ...(bloodGroup && { bloodGroup }),
        ...(languages && { languages }),
      },
      { returnDocument: "after" },
    );

    req.rData = driver;
    req.msg = "profile_updated";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateProfilePhoto = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    if (!req.file) {
      req.rCode = 0;
      req.msg = "photo_required";
      return next();
    }

    const upload = await fileUploadService.uploadFileToAws([req.file]);

    const driver = await DriverModel.findByIdAndUpdate(
      driverId,
      { profilePhoto: upload.images },
      { returnDocument: "after" },
    );

    req.rData = driver;
    req.msg = "photo_updated";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// BANK DETAILS
// =====================

export const getBankDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver = await DriverModel.findById(driverId)
      .select("bankDetails")
      .lean();

    req.rData = driver?.bankDetails || null;
    req.msg = "bank_details_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateBankDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { accountHolderName, bankName, accountNumber, ifscCode } = req.body;

    const driver = await DriverModel.findByIdAndUpdate(
      driverId,
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

    req.rData = driver?.bankDetails;
    req.msg = "bank_details_updated";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// ADDRESS
// =====================

export const getAddresses = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver = await DriverModel.findById(driverId)
      .select("addresses")
      .lean();

    req.rData = driver?.addresses || [];
    req.msg = "addresses_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const addAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const {
      type,
      addressLine1,
      addressLine2,
      district,
      state,
      pincode,
      country,
    } = req.body;

    const newAddress = {
      _id: new Types.ObjectId(),
      type,
      addressLine1,
      addressLine2,
      district,
      state,
      pincode,
      country: country || "India",
    };

    const driver = await DriverModel.findByIdAndUpdate(
      driverId,
      { $push: { addresses: newAddress } },
      { returnDocument: "after" },
    );

    req.rData = driver?.addresses;
    req.msg = "address_added";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { addressId } = req.params as Record<string, string>;
    const updateData = req.body;

    await DriverModel.updateOne(
      { _id: driverId, "addresses._id": addressId },
      { $set: { "addresses.$": { ...updateData, _id: addressId } } },
    );

    req.msg = "address_updated";
    next();
  } catch (error) {
    next(error);
  }
};

export const deleteAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { addressId } = req.params as Record<string, string>;

    await DriverModel.updateOne(
      { _id: driverId },
      { $pull: { addresses: { _id: addressId } } },
    );

    req.msg = "address_deleted";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// EARNINGS & WALLET
// =====================

export const getEarnings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { period = "today" } = req.query;

    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (period === "weekly") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "monthly") {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    const earnings = await BookingModel.aggregate([
      {
        $match: {
          driverId: new Types.ObjectId(driverId),
          status: "COMPLETED",
          completedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: "$fare" },
          completedTrips: { $sum: 1 },
        },
      },
    ]);

    const stats = earnings[0] || {
      totalEarnings: 0,
      completedTrips: 0,
    };

    req.rData = stats;
    req.msg = "earnings_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getEarningsHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { page = 1, limit = 20 } = req.query;

    const bookings = await BookingModel.find({
      driverId: new Types.ObjectId(driverId),
      status: "COMPLETED",
    })
      .select("bookingNumber fare completedAt pickup drop distanceKm")
      .sort({ completedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    req.rData = bookings;
    req.msg = "earnings_history_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getWallet = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    let wallet = await WalletModel.findOne({
      userId: new Types.ObjectId(driverId),
    });

    if (!wallet) {
      wallet = await WalletModel.create({
        userId: new Types.ObjectId(driverId),
        balance: 0,
        lockedBalance: 0,
      });
    }

    req.rData = wallet;
    req.msg = "wallet_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getWalletTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { page = 1, limit = 20, type } = req.query;

    const query: any = { userId: new Types.ObjectId(driverId) };
    if (type) query.type = type;

    const transactions = await WalletTransactionModel.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    req.rData = transactions;
    req.msg = "transactions_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const rechargeWallet = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { amount } = req.body;

    // TODO: Integrate with payment gateway
    req.rData = {
      orderId: `MZY_${Date.now()}`,
      amount,
      currency: "INR",
    };
    req.msg = "recharge_initiated";
    next();
  } catch (error) {
    next(error);
  }
};

export const withdrawFromWallet = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { amount } = req.body;

    const wallet = await WalletModel.findOne({
      userId: new Types.ObjectId(driverId),
    });

    if (!wallet || wallet.balance < amount) {
      req.rCode = 0;
      req.msg = "insufficient_balance";
      return next();
    }

    // Deduct from wallet
    wallet.balance -= amount;
    await wallet.save();

    req.rData = { newBalance: wallet.balance };
    req.msg = "withdrawal_initiated";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// BOOKINGS (DRIVER SIDE)
// =====================

export const getRecommendedBookings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver = await DriverModel.findById(driverId);
    if (!driver?.isOnline) {
      req.rData = [];
      req.msg = "driver_offline";
      return next();
    }

    // Find nearby pending bookings
    const bookings = await BookingModel.find({
      status: "PENDING",
      driverId: null,
    })
      .populate("userId", "fullName")
      .populate("vehicleTypeId", "name")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    req.rData = bookings;
    req.msg = "bookings_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getBookingHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { page = 1, limit = 20, status } = req.query;

    const query: any = { driverId: new Types.ObjectId(driverId) };
    if (status) query.status = status;

    const bookings = await BookingModel.find(query)
      .populate("userId", "fullName")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const total = await BookingModel.countDocuments(query);

    req.rData = { bookings, total, page: Number(page), limit: Number(limit) };
    req.msg = "history_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getCurrentBooking = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const booking = await BookingModel.findOne({
      driverId: new Types.ObjectId(driverId),
      status: { $in: ["ASSIGNED", "DRIVER_ARRIVED", "PICKED", "IN_PROGRESS"] },
    })
      .populate("userId", "fullName")
      .lean();

    req.rData = booking;
    req.msg = booking ? "booking_fetched" : "no_active_booking";
    next();
  } catch (error) {
    next(error);
  }
};

export const acceptBooking = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    // Use dispatch service to handle acceptance (auto-closes for other drivers)
    const result = await BookingDispatchService.handleDriverAcceptance(
      bookingId,
      driverId,
    );

    if (!result.success) {
      req.rCode = 0;
      req.msg = result.message || "booking_not_available";
      return next();
    }

    // Update driver status
    await DriverModel.findByIdAndUpdate(driverId, {
      currentBookingId: new Types.ObjectId(bookingId),
    });

    // Get updated booking
    const booking = await BookingModel.findById(bookingId)
      .populate("userId", "fullName")
      .lean();

    req.rData = booking;
    req.msg = "booking_accepted";
    next();
  } catch (error) {
    next(error);
  }
};

export const rejectBooking = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    // Use dispatch service to handle rejection
    await BookingDispatchService.handleDriverRejection(bookingId, driverId);

    req.msg = "booking_rejected";
    next();
  } catch (error) {
    next(error);
  }
};

export const arrivedAtPickup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    const booking = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        driverId: new Types.ObjectId(driverId),
        status: "ASSIGNED",
      },
      { status: "DRIVER_ARRIVED", driverArrivedAt: new Date() },
      { returnDocument: "after" },
    );

    if (!booking) {
      req.rCode = 0;
      req.msg = "invalid_booking";
      return next();
    }

    const io = getIO();
    io.to(`user_${booking.userId}`).emit("driver_arrived", booking);

    req.rData = booking;
    req.msg = "arrived_at_pickup";
    next();
  } catch (error) {
    next(error);
  }
};

export const verifyPickupOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;
    const { otp } = req.body;

    const booking = await BookingModel.findOne({
      _id: bookingId,
      driverId: new Types.ObjectId(driverId),
      status: "DRIVER_ARRIVED",
    });

    if (!booking) {
      req.rCode = 0;
      req.msg = "invalid_booking";
      return next();
    }

    if (booking.otp !== otp) {
      req.rCode = 0;
      req.msg = "invalid_otp";
      return next();
    }

    booking.status = "PICKED";
    booking.pickedAt = new Date();
    await booking.save();

    req.rData = booking;
    req.msg = "otp_verified";
    next();
  } catch (error) {
    next(error);
  }
};

export const startTrip = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    const booking = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        driverId: new Types.ObjectId(driverId),
        status: "PICKED",
      },
      { status: "IN_PROGRESS" },
      { returnDocument: "after" },
    );

    if (!booking) {
      req.rCode = 0;
      req.msg = "invalid_booking";
      return next();
    }

    const io = getIO();
    io.to(`user_${booking.userId}`).emit("trip_started", booking);

    req.rData = booking;
    req.msg = "trip_started";
    next();
  } catch (error) {
    next(error);
  }
};

export const completeTrip = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    const booking = await BookingModel.findOne({
      _id: bookingId,
      driverId: new Types.ObjectId(driverId),
      status: "IN_PROGRESS",
    });

    if (!booking) {
      req.rCode = 0;
      req.msg = "invalid_booking";
      return next();
    }

    booking.status = "COMPLETED";
    booking.completedAt = new Date();
    await booking.save();

    // Update driver
    await DriverModel.findByIdAndUpdate(driverId, {
      currentBookingId: null,
      $inc: { totalRides: 1 },
    });

    const io = getIO();
    io.to(`user_${booking.userId}`).emit("trip_completed", booking);

    req.rData = booking;
    req.msg = "trip_completed";
    next();
  } catch (error) {
    next(error);
  }
};

export const collectCashPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    const booking = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        driverId: new Types.ObjectId(driverId),
        status: "COMPLETED",
      },
      { paymentStatus: "PAID" },
      { returnDocument: "after" },
    );

    if (!booking) {
      req.rCode = 0;
      req.msg = "invalid_booking";
      return next();
    }

    req.rData = booking;
    req.msg = "cash_collected";
    next();
  } catch (error) {
    next(error);
  }
};

export const getBookingDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { bookingId } = req.params as Record<string, string>;

    const booking = await BookingModel.findOne({
      _id: bookingId,
      driverId: new Types.ObjectId(driverId),
    })
      .populate("userId", "fullName")
      .populate("vehicleTypeId", "name")
      .lean();

    if (!booking) {
      req.rCode = 0;
      req.msg = "booking_not_found";
      return next();
    }

    req.rData = booking;
    req.msg = "booking_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// ONLINE STATUS
// =====================

export const toggleOnlineStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { isOnline } = req.body;

    const driver = await DriverModel.findByIdAndUpdate(
      driverId,
      { isOnline },
      { returnDocument: "after" },
    );

    req.rData = { isOnline: driver?.isOnline };
    req.msg = isOnline ? "driver_online" : "driver_offline";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateLocation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { latitude, longitude, heading, speed } = req.body;

    await DriverLocationService.updateDriverLocation(
      new Types.ObjectId(driverId),
      latitude,
      longitude,
      heading,
      speed,
    );

    req.msg = "location_updated";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// VEHICLES
// =====================

export const getVehicles = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const vehicles = await DriverVehicleModel.find({
      driverId: new Types.ObjectId(driverId),
    })
      .populate("vehicleTypeId", "name")
      .lean();

    req.rData = vehicles;
    req.msg = "vehicles_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const addVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { vehicleTypeId, registrationNumber } = req.body;

    const vehicle = await DriverVehicleModel.create({
      driverId: new Types.ObjectId(driverId),
      vehicleTypeId: new Types.ObjectId(vehicleTypeId),
      registrationNumber,
      isActive: false,
    });

    req.rData = vehicle;
    req.msg = "vehicle_added";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { vehicleId } = req.params as Record<string, string>;
    const updateData = req.body;

    const vehicle = await DriverVehicleModel.findOneAndUpdate(
      { _id: vehicleId, driverId: new Types.ObjectId(driverId) },
      updateData,
      { returnDocument: "after" },
    );

    req.rData = vehicle;
    req.msg = "vehicle_updated";
    next();
  } catch (error) {
    next(error);
  }
};

export const deleteVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { vehicleId } = req.params as Record<string, string>;

    await DriverVehicleModel.deleteOne({
      _id: vehicleId,
      driverId: new Types.ObjectId(driverId),
    });

    req.msg = "vehicle_deleted";
    next();
  } catch (error) {
    next(error);
  }
};

export const setActiveVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { vehicleId } = req.params as Record<string, string>;

    // Deactivate all vehicles
    await DriverVehicleModel.updateMany(
      { driverId: new Types.ObjectId(driverId) },
      { isActive: false },
    );

    // Activate selected vehicle
    const vehicle = await DriverVehicleModel.findOneAndUpdate(
      { _id: vehicleId, driverId: new Types.ObjectId(driverId) },
      { isActive: true },
      { returnDocument: "after" },
    );

    req.rData = vehicle;
    req.msg = "vehicle_activated";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// TRAINING & LEARNING
// =====================

export const getTrainingModules = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const modules = [
      {
        _id: "1",
        title: "How to Accept Bookings",
        description: "Learn how to get and confirm bookings",
        duration: "15 min",
        lessons: 4,
        isCompleted: false,
      },
      {
        _id: "2",
        title: "Using Live Navigation",
        description: "Step-by-step guide to follow",
        duration: "10 min",
        lessons: 3,
        isCompleted: false,
      },
      {
        _id: "3",
        title: "Collecting Payments",
        description: "Learn digital & cash payment process",
        duration: "12 min",
        lessons: 4,
        isCompleted: false,
      },
      {
        _id: "4",
        title: "Customer Service Tips",
        description: "How to communicate & maintain ratings",
        duration: "20 min",
        lessons: 5,
        isLocked: true,
      },
    ];

    req.rData = modules;
    req.msg = "training_modules_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getTrainingModuleDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { moduleId } = req.params as Record<string, string>;

    const module = {
      _id: moduleId,
      title: "How to Accept Bookings",
      description: "Learn how to get and confirm bookings",
      duration: "15 min",
      videoUrl: "https://example.com/video.mp4",
      lessons: [
        {
          _id: "1",
          title: "Introduction",
          duration: "04:23 min",
          isCompleted: false,
        },
        {
          _id: "2",
          title: "Accepting Bookings",
          duration: "04:23 min",
          isCompleted: false,
        },
        {
          _id: "3",
          title: "Best Practices",
          duration: "04:23 min",
          isCompleted: false,
        },
      ],
    };

    req.rData = module;
    req.msg = "module_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const completeTrainingLesson = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { moduleId, lessonId } = req.params as Record<string, string>;

    await DriverModel.findByIdAndUpdate(driverId, {
      $addToSet: { completedLessons: `${moduleId}_${lessonId}` },
    });

    req.msg = "lesson_completed";
    next();
  } catch (error) {
    next(error);
  }
};

export const getTrainingProgress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver =
      await DriverModel.findById(driverId).select("completedLessons");
    const completedCount = driver?.completedLessons?.length || 0;
    const totalLessons = 16;

    req.rData = {
      completedLessons: completedCount,
      totalLessons,
      progressPercentage: Math.round((completedCount / totalLessons) * 100),
    };
    req.msg = "progress_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// BADGES & ACHIEVEMENTS
// =====================

export const getBadges = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const allBadges = [
      {
        _id: "1",
        name: "Profile Verified",
        description: "KYC & Documents Verified",
        icon: "✓",
        category: "onboarding",
      },
      {
        _id: "2",
        name: "10 Trips Completed",
        description: "First Milestone!",
        icon: "🏆",
        category: "milestones",
      },
      {
        _id: "3",
        name: "50 Trips Completed",
        description: "Halfway Champion",
        icon: "⭐",
        category: "milestones",
      },
      {
        _id: "4",
        name: "5-Star Service",
        description: "Consistently Rated Excellent",
        icon: "⭐",
        category: "performance",
      },
      {
        _id: "5",
        name: "Zero Cancellation",
        description: "Perfect Reliability",
        icon: "🎯",
        category: "performance",
      },
    ];

    req.rData = allBadges;
    req.msg = "badges_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getUnlockedBadges = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver =
      await DriverModel.findById(driverId).select("unlockedBadges");

    req.rData = driver?.unlockedBadges || [];
    req.msg = "unlocked_badges_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getBadgeRequirements = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { badgeId } = req.params as Record<string, string>;

    const requirements: Record<string, any> = {
      "3": { type: "trips", target: 50, description: "Complete 50 trips" },
      "4": { type: "rating", target: 5, description: "Maintain 5-star rating" },
    };

    req.rData = requirements[badgeId] || null;
    req.msg = "requirements_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// INCENTIVES
// =====================

export const getIncentives = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = [];
    req.msg = "incentives_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getActiveIncentives = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const offers = [
      {
        _id: "1",
        title: "Complete 10 trips today",
        reward: 200,
        progress: 6,
        target: 10,
      },
      {
        _id: "2",
        title: "Weekend Bonus",
        reward: 500,
        progress: 15,
        target: 20,
      },
    ];

    req.rData = offers;
    req.msg = "active_incentives_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// REFERRAL
// =====================

export const getReferralCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const driver = await DriverModel.findById(driverId).select("referralCode");

    if (!driver?.referralCode) {
      const code = `MZD${driverId.toString().slice(-6).toUpperCase()}`;
      await DriverModel.findByIdAndUpdate(driverId, { referralCode: code });
      req.rData = { referralCode: code };
    } else {
      req.rData = { referralCode: driver.referralCode };
    }

    req.msg = "referral_code_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const applyReferralCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { code } = req.body;

    const driver = await DriverModel.findById(driverId);
    if (driver?.referredBy) {
      req.rCode = 0;
      req.msg = "referral_already_applied";
      return next();
    }

    const referrer = await DriverModel.findOne({ referralCode: code });
    if (!referrer) {
      req.rCode = 0;
      req.msg = "invalid_referral_code";
      return next();
    }

    await DriverModel.findByIdAndUpdate(driverId, { referredBy: referrer._id });

    req.msg = "referral_applied";
    next();
  } catch (error) {
    next(error);
  }
};

export const getReferralHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    const referrals = await DriverModel.find({
      referredBy: new Types.ObjectId(driverId),
    })
      .select("fullName createdAt")
      .sort({ createdAt: -1 })
      .lean();

    req.rData = referrals;
    req.msg = "referral_history_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// ONBOARDING PAYMENT
// =====================

export const getOnboardingFee = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = {
      amount: 999,
      currency: "INR",
      description: "One time joining fee per vehicle.",
    };
    req.msg = "fee_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const payOnboardingFee = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = {
      orderId: `MZY_${Date.now()}`,
      amount: 999,
      currency: "INR",
    };
    req.msg = "payment_initiated";
    next();
  } catch (error) {
    next(error);
  }
};

export const verifyOnboardingPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { paymentId } = req.body;

    await DriverModel.findByIdAndUpdate(driverId, {
      onboardingFeePaid: true,
      onboardingPaymentId: paymentId,
    });

    req.msg = "payment_verified";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// SUPPORT
// =====================

export const raiseTicket = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = {
      ticketId: `TKT${Date.now()}`,
      status: "OPEN",
    };
    req.msg = "ticket_raised";
    next();
  } catch (error) {
    next(error);
  }
};

export const getTickets = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = [];
    req.msg = "tickets_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const getTicketDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = null;
    req.msg = "ticket_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const replyToTicket = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.msg = "reply_sent";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// DRIVER INSTRUCTIONS
// =====================

export const getInstructions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const instructions = [
      { _id: "1", icon: "⏰", text: "Be on time for every pickup" },
      { _id: "2", icon: "🚗", text: "Keep your vehicle clean and ready" },
      { _id: "3", icon: "📦", text: "Handle parcels carefully" },
      { _id: "4", icon: "💳", text: "Encourage cashless payments" },
      { _id: "5", icon: "📞", text: "Call customer only when necessary" },
    ];

    req.rData = instructions;
    req.msg = "instructions_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const acknowledgeInstructions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    await DriverModel.findByIdAndUpdate(driverId, {
      instructionsAcknowledgedAt: new Date(),
    });

    req.msg = "instructions_acknowledged";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// DAILY CHECKLIST
// =====================

export const getDailyChecklist = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const checklist = [
      { _id: "1", label: "Face and T-Shirt Selfie", required: true },
      { _id: "2", label: "Front Side of Car/Bike", required: true },
      { _id: "3", label: "Right Side of Car/Bike", required: true },
      { _id: "4", label: "Left Side of Car/Bike", required: true },
      { _id: "5", label: "Back Side of Car/Bike", required: true },
    ];

    req.rData = checklist;
    req.msg = "checklist_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const submitDailyChecklist = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;

    let images: string[] = [];
    if (Array.isArray(req.files)) {
      for (const file of req.files) {
        const upload = await fileUploadService.uploadFileToAws([file]);
        images.push(upload.images as string);
      }
    }

    await DriverModel.findByIdAndUpdate(driverId, {
      lastChecklistAt: new Date(),
      lastChecklistImages: images,
    });

    req.msg = "checklist_submitted";
    next();
  } catch (error) {
    next(error);
  }
};

// =====================
// NOTIFICATIONS
// =====================

export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.rData = [];
    req.msg = "notifications_fetched";
    next();
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    req.msg = "notification_read";
    next();
  } catch (error) {
    next(error);
  }
};

export const updateFcmToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const driverId = (req as any).driverId;
    const { fcmToken } = req.body;

    await DriverModel.findByIdAndUpdate(driverId, { fcmToken });

    req.msg = "fcm_token_updated";
    next();
  } catch (error) {
    next(error);
  }
};
