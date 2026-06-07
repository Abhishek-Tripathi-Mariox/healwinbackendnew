import { Request, Response } from "express";
import mongoose from "mongoose";
import Booking from "../models/booking.model";
import Vehicle from "../models/vehicle.model";
import VehicleType from "../models/vehicle-type.model";
import VehicleCategory from "../models/vehicle-category.model";
import PromoCode from "../models/promo-code.model";
import AddonService from "../models/addon-service.model";
import GoodsType from "../models/goods-type.model";
import CancellationReason from "../models/cancellation-reason.model";
import { TimeSlot } from "../models/time-slot.model";
import * as FareService from "../services/fare.service";
import * as PromoService from "../services/promo.service";
import * as CoinService from "../services/coin.service";
import * as InvoiceService from "../services/invoice.service";
import * as BookingDispatchService from "../services/booking-dispatch.service";
import { cache } from "../utils/redis.util";

/**
 * Get fare estimate for a booking
 */
export const getFareEstimate = async (req: Request, res: Response) => {
  try {
    const {
      distanceKm,
      durationMin,
      stops,
      vehicleTypeId,
      serviceType,
      addons,
      loadingUnloadingCharge,
      promoCode,
      useCoins,
    } = req.body;

    if (!distanceKm || !durationMin || !vehicleTypeId) {
      return res.status(400).json({
        success: false,
        message: "Distance, duration, and vehicle type are required",
      });
    }

    // Calculate fare
    const fareBreakdown = await FareService.calculateFare({
      vehicleTypeId,
      distanceKm,
      durationMin,
      serviceType: serviceType || "WITHIN_CITY",
      addons: addons || [],
      loadingUnloadingCharge: loadingUnloadingCharge || 0,
      stops: stops?.length || 0,
    });

    let finalAmount = fareBreakdown.finalFare;
    let promoDiscount = 0;
    let coinDiscount = 0;

    // Apply promo code if provided
    if (promoCode) {
      const promoResult = await PromoService.validatePromoCode(
        promoCode,
        (req as any).user._id,
        finalAmount,
        vehicleTypeId,
        serviceType,
      );

      if (promoResult.valid) {
        promoDiscount = promoResult.discountAmount || 0;
        finalAmount -= promoDiscount;
      }
    }

    // Calculate coin discount if requested
    if (useCoins) {
      const coinWallet = await CoinService.getCoinWallet((req as any).user._id);
      const maxCoinDiscount = Math.min(
        coinWallet?.balance || 0,
        Math.floor(finalAmount * 0.1), // Max 10% discount with coins
      );
      coinDiscount = maxCoinDiscount;
      finalAmount -= coinDiscount;
    }

    res.json({
      success: true,
      data: {
        fareBreakdown,
        promoDiscount,
        coinDiscount,
        finalAmount: Math.max(finalAmount, 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate fare estimate",
    });
  }
};

/**
 * Create a new booking
 */
export const createBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = (req as any).user._id;
    const {
      pickupLocation,
      pickupAddress,
      dropLocation,
      dropAddress,
      distanceKm,
      durationMin,
      stops,
      vehicleTypeId,
      serviceType,
      goodsType,
      goodsDescription,
      goodsWeight,
      goodsQuantity,
      addons,
      loadingUnloading,
      promoCode,
      useCoins,
      coinsToUse,
      paymentMethod,
      scheduledDate,
      scheduledTimeSlotId,
      notes,
      receiverName,
      receiverPhone,
    } = req.body;

    // Validate required fields
    if (
      !pickupLocation ||
      !dropLocation ||
      !vehicleTypeId ||
      !distanceKm ||
      !durationMin
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing (pickupLocation, dropLocation, vehicleTypeId, distanceKm, durationMin)",
      });
    }

    // Calculate fare
    const fareBreakdown = await FareService.calculateFare({
      vehicleTypeId,
      distanceKm,
      durationMin,
      serviceType: serviceType || "WITHIN_CITY",
      addons: addons || [],
      loadingUnloadingCharge:
        loadingUnloading?.loadingCharge + loadingUnloading?.unloadingCharge ||
        0,
      stops: stops?.length || 0,
    });

    let totalAmount = fareBreakdown.finalFare;
    let promoDiscount = 0;
    let promoCodeId = null;
    let coinDiscount = 0;
    let coinsUsed = 0;

    // Validate and apply promo code
    if (promoCode) {
      const promoResult = await PromoService.validatePromoCode(
        promoCode,
        userId,
        totalAmount,
        vehicleTypeId,
        serviceType,
      );

      if (promoResult.valid && promoResult.promo) {
        promoDiscount = promoResult.discountAmount || 0;
        promoCodeId = promoResult.promo._id;
        totalAmount -= promoDiscount;
      }
    }

    // Apply coins
    if (useCoins && coinsToUse > 0) {
      try {
        await CoinService.debitCoins(
          userId,
          coinsToUse,
          "REDEMPTION",
          undefined,
          undefined,
          `Used ${coinsToUse} coins for booking discount`,
        );
        coinsUsed = coinsToUse;
        coinDiscount = coinsToUse; // 1 coin = 1 rupee
        totalAmount -= coinDiscount;
      } catch (coinError) {
        // If coin debit fails, continue without coin discount
        console.error("Failed to debit coins:", coinError);
      }
    }

    // Generate booking number
    const bookingCount = await Booking.countDocuments();
    const bookingNumber = `MZ${(bookingCount + 1).toString().padStart(4, "0")}`;

    // Create booking
    const booking = new Booking({
      bookingNumber,
      userId,
      serviceType: serviceType || "WITHIN_CITY",
      pickupLocation: {
        type: "Point",
        coordinates: [pickupLocation.lng, pickupLocation.lat],
      },
      pickupAddress,
      dropoffLocation: {
        type: "Point",
        coordinates: [dropLocation.lng, dropLocation.lat],
      },
      dropoffAddress: dropAddress,
      stops: (stops || []).map((stop: any, index: number) => ({
        order: index + 1,
        location: {
          type: "Point",
          coordinates: [stop.location.lng, stop.location.lat],
        },
        address: stop.address,
        contactName: stop.contactName,
        contactPhone: stop.contactPhone,
        instructions: stop.instructions,
      })),
      vehicleTypeId,
      goodsType: goodsType || "PERSONAL",
      goodsDescription,
      goodsWeight,
      goodsQuantity,
      distance: distanceKm,
      estimatedDuration: durationMin,
      baseFare: fareBreakdown.baseFare,
      distanceCharge: fareBreakdown.distanceCharge,
      timeCharge: fareBreakdown.timeCharge || 0,
      surgeCharge: fareBreakdown.surgeCharge,
      surgeMultiplier: fareBreakdown.surgeMultiplier || 1,
      addons: (addons || []).map((addon: any) => ({
        addonId: addon.addonId,
        name: addon.name,
        price: addon.price,
        quantity: addon.quantity || 1,
      })),
      loadingUnloading: loadingUnloading || {
        required: false,
        loadingFloors: 0,
        unloadingFloors: 0,
        loadingCharge: 0,
        unloadingCharge: 0,
      },
      promoCodeId,
      promoDiscount,
      coinsUsed,
      coinDiscount,
      gstAmount: fareBreakdown.gstAmount,
      gstPercentage: fareBreakdown.gstPercentage,
      totalFare: totalAmount,
      paymentMethod: paymentMethod || "CASH",
      status: scheduledDate ? "SCHEDULED" : "PENDING",
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      scheduledTimeSlotId,
      notes,
      receiverName,
      receiverPhone,
    });

    await booking.save({ session });
    await session.commitTransaction();

    // Dispatch booking to nearby drivers (bell ringing)
    if (!scheduledDate) {
      // Only dispatch immediate bookings, not scheduled ones
      const dispatchResult =
        await BookingDispatchService.dispatchBookingToDrivers(
          booking._id.toString(),
        );

      console.log(
        `Booking ${booking.bookingNumber} dispatched:`,
        dispatchResult,
      );
    }

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: booking,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create booking",
    });
  } finally {
    session.endSession();
  }
};

/**
 * Get user's bookings
 */
export const getUserBookings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const query: any = { userId };
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("vehicleTypeId", "name icon")
        .populate("driverId", "name mobileNumber profileImage"),
      Booking.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
};

/**
 * Get booking by ID
 */
export const getBookingById = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({ _id: bookingId, userId })
      .populate("vehicleTypeId", "name icon capacity")
      .populate("driverId", "name mobileNumber profileImage rating")
      .populate("vehicleId", "vehicleNumber brand model color");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch booking",
    });
  }
};

/**
 * Track active booking
 */
export const trackBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({ _id: bookingId, userId })
      .populate("driverId", "name mobileNumber profileImage rating")
      .populate("vehicleId", "vehicleNumber brand model color");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Get driver's current location from cache
    let driverLocation = null;
    if (booking.driverId) {
      driverLocation = await cache.get(`driver:location:${booking.driverId}`);
    }

    res.json({
      success: true,
      data: {
        booking,
        driverLocation,
        eta: booking.estimatedDuration, // TODO: Calculate real-time ETA
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to track booking",
    });
  }
};

/**
 * Apply promo code to booking
 */
export const applyPromoCode = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const { promoCode } = req.body;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: "PENDING",
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or cannot apply promo",
      });
    }

    if (booking.promoCodeId) {
      return res.status(400).json({
        success: false,
        message: "Promo code already applied",
      });
    }

    const promoResult = await PromoService.validatePromoCode(
      promoCode,
      userId,
      booking.finalFare,
      booking.vehicleTypeId,
      booking.serviceType,
    );

    if (!promoResult.valid) {
      return res.status(400).json({
        success: false,
        message: promoResult.error,
      });
    }

    // Update booking with promo discount
    booking.promoCodeId = promoResult.promo?._id;
    booking.promoDiscount = promoResult.discountAmount || 0;
    booking.finalFare -= promoResult.discountAmount || 0;
    await booking.save();

    res.json({
      success: true,
      message: "Promo code applied successfully",
      data: {
        discount: promoResult.discountAmount,
        newTotal: booking.finalFare,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to apply promo code",
    });
  }
};

/**
 * Apply coins to booking
 */
export const applyCoins = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const { coinsToUse } = req.body;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: "PENDING",
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or cannot apply coins",
      });
    }

    if ((booking.coinsUsed ?? 0) > 0) {
      return res.status(400).json({
        success: false,
        message: "Coins already applied",
      });
    }

    const coinWallet = await CoinService.getCoinWallet(userId);
    if (!coinWallet || coinWallet.balance < coinsToUse) {
      return res.status(400).json({
        success: false,
        message: "Insufficient coin balance",
      });
    }

    // Max 10% discount with coins
    const maxDiscount = Math.floor(booking.finalFare * 0.1);
    const actualCoins = Math.min(coinsToUse, maxDiscount, coinWallet.balance);

    // Update booking
    booking.coinsUsed = actualCoins;
    booking.coinDiscount = actualCoins;
    booking.finalFare -= actualCoins;
    await booking.save();

    res.json({
      success: true,
      message: "Coins applied successfully",
      data: {
        coinsUsed: actualCoins,
        coinDiscount: actualCoins,
        newTotal: booking.finalFare,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to apply coins",
    });
  }
};

/**
 * Schedule a booking
 */
export const scheduleBooking = async (req: Request, res: Response) => {
  // Same as createBooking but with scheduled status
  return createBooking(req, res);
};

/**
 * Get scheduled bookings
 */
export const getScheduledBookings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const bookings = await Booking.find({
      userId,
      status: "SCHEDULED",
      scheduledDate: { $gte: new Date() },
    })
      .sort({ scheduledDate: 1 })
      .populate("vehicleTypeId", "name icon");

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch scheduled bookings",
    });
  }
};

/**
 * Cancel scheduled booking
 */
export const cancelScheduledBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: "SCHEDULED",
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Scheduled booking not found",
      });
    }

    booking.status = "CANCELLED";
    booking.cancelledAt = new Date();
    booking.cancelledBy = "USER";
    await booking.save();

    res.json({
      success: true,
      message: "Scheduled booking cancelled",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel booking",
    });
  }
};

/**
 * Cancel booking
 */
export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const { cancellationReasonId } = req.body;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: { $in: ["SEARCHING", "ASSIGNED", "DRIVER_ARRIVED"] },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or cannot be cancelled",
      });
    }

    // Get cancellation reason for penalty calculation
    let refundPercentage = 100;
    if (cancellationReasonId) {
      const reason = await CancellationReason.findById(cancellationReasonId);
      if (reason && booking.status !== "PENDING") {
        refundPercentage = reason.refundPercentage;
      }
      booking.cancellationReasonId = cancellationReasonId;
    }

    booking.status = "CANCELLED";
    booking.cancelledAt = new Date();
    booking.cancelledBy = "USER";
    booking.refundStatus = refundPercentage === 100 ? "PROCESSED" : "PENDING";
    await booking.save();

    // TODO: Process refund if payment was made
    // TODO: Restore coins if used
    // TODO: Notify driver if assigned

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      data: {
        refundPercentage,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel booking",
    });
  }
};

/**
 * Rate booking/driver
 */
export const rateBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const { rating, review } = req.body;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: "COMPLETED",
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Completed booking not found",
      });
    }

    if (booking.rating) {
      return res.status(400).json({
        success: false,
        message: "Booking already rated",
      });
    }

    booking.rating = rating;
    booking.review = review;
    await booking.save();

    // TODO: Update driver's average rating

    res.json({
      success: true,
      message: "Rating submitted successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to submit rating",
    });
  }
};

/**
 * Get booking invoice
 */
export const getBookingInvoice = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params as Record<string, string>;
    const userId = (req as any).user._id;

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
      status: "COMPLETED",
    }).populate("vehicleTypeId", "name");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Completed booking not found",
      });
    }

    // Generate or fetch invoice
    const invoice = await InvoiceService.generateInvoice(booking._id);

    res.json({
      success: true,
      data: invoice,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch invoice",
    });
  }
};

/**
 * Get vehicle options for a route
 */
export const getVehicleOptions = async (req: Request, res: Response) => {
  try {
    const { distanceKm, durationMin, serviceType } = req.body;

    if (!distanceKm || !durationMin) {
      return res.status(400).json({
        success: false,
        message: "Distance and duration are required",
      });
    }

    // Get all active vehicle types with caching
    let vehicleTypes = await cache.get("vehicleTypes:active");
    if (!vehicleTypes) {
      vehicleTypes = await VehicleType.find({
        isActive: true,
        isDeleted: false,
      })
        .populate("categoryId", "name")
        .sort({ sortOrder: 1 });
      await cache.set("vehicleTypes:active", vehicleTypes, 3600);
    }

    // Calculate fare for each vehicle type
    const options = await Promise.all(
      (vehicleTypes as any[]).map(async (type: any) => {
        const fare = await FareService.calculateFare({
          vehicleTypeId: type._id,
          distanceKm,
          durationMin,
          serviceType: serviceType || "WITHIN_CITY",
          stops: 0,
        });

        return {
          vehicleType: type,
          fare: fare.finalFare,
          fareBreakdown: fare,
          eta: Math.ceil(durationMin / 60), // Convert minutes to hours (or use as-is if already in minutes)
        };
      }),
    );

    res.json({
      success: true,
      data: options,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vehicle options",
    });
  }
};

/**
 * Get addon services
 */
export const getAddonServices = async (req: Request, res: Response) => {
  try {
    let addons = await cache.get("addons:active");
    if (!addons) {
      addons = await AddonService.find({ isActive: true }).sort({
        sortOrder: 1,
      });
      await cache.set("addons:active", addons, 3600);
    }

    res.json({
      success: true,
      data: addons,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch addon services",
    });
  }
};

/**
 * Get goods types
 */
export const getGoodsTypes = async (req: Request, res: Response) => {
  try {
    let goodsTypes = await cache.get("goodsTypes:active");
    if (!goodsTypes) {
      goodsTypes = await GoodsType.find({ isActive: true }).sort({
        sortOrder: 1,
      });
      await cache.set("goodsTypes:active", goodsTypes, 3600);
    }

    res.json({
      success: true,
      data: goodsTypes,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch goods types",
    });
  }
};

/**
 * Get cancellation reasons
 */
export const getCancellationReasons = async (req: Request, res: Response) => {
  try {
    let reasons = await cache.get("cancellationReasons:user");
    if (!reasons) {
      reasons = await CancellationReason.find({
        isActive: true,
        applicableTo: { $in: ["USER", "BOTH"] },
      }).sort({ sortOrder: 1 });
      await cache.set("cancellationReasons:user", reasons, 3600);
    }

    res.json({
      success: true,
      data: reasons,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch cancellation reasons",
    });
  }
};

/**
 * Get time slots for scheduling
 */
export const getTimeSlots = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();
    const dayOfWeek = targetDate
      .toLocaleDateString("en-US", { weekday: "long" })
      .toUpperCase();

    const slots = await TimeSlot.find({
      isActive: true,
      daysAvailable: dayOfWeek,
    }).sort({ startTime: 1 });

    res.json({
      success: true,
      data: slots,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch time slots",
    });
  }
};
