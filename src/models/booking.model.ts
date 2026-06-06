import mongoose, { Schema, Types } from "mongoose";
import { IBooking } from "../interfaces/booking";

// Location sub-schema
const LocationSchema = new Schema(
  {
    address: { type: String, required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    contactName: String,
    contactPhone: String,
    floor: Number,
    isLiftAvailable: Boolean,
  },
  { _id: false },
);

// Addon service in booking
const BookingAddonSchema = new Schema(
  {
    addonId: { type: Schema.Types.ObjectId, ref: "AddonService" },
    name: String,
    price: Number,
    quantity: { type: Number, default: 1 },
  },
  { _id: false },
);

const BookingSchema = new Schema<IBooking>(
  {
    // Booking ID for display (e.g., MZ1233)
    bookingNumber: {
      type: String,
      unique: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      index: true,
    },
    enterpriseId: {
      type: Schema.Types.ObjectId,
      ref: "Enterprise",
      index: true,
    },
    vehicleTypeId: {
      type: Schema.Types.ObjectId,
      ref: "VehicleType",
      required: true,
    },

    // Service type (Within City / Outstation)
    serviceType: {
      type: String,
      enum: ["WITHIN_CITY", "OUTSTATION"],
      default: "WITHIN_CITY",
      index: true,
    },

    // Locations - Multi-stop support
    pickup: LocationSchema,
    drop: LocationSchema,
    stops: [LocationSchema], // Additional stops

    // Goods information
    goodsType: {
      type: String,
      enum: ["BUSINESS", "PERSONAL"],
      default: "PERSONAL",
    },
    goodsDescription: String,
    goodsWeight: Number, // in kg
    goodsQuantity: Number,

    // Fare breakdown
    distanceKm: { type: Number, required: true },
    durationMin: { type: Number, required: true },
    baseFare: { type: Number, required: true },
    distanceCharge: { type: Number, default: 0 },
    timeCharge: { type: Number, default: 0 },
    surgeFare: { type: Number, default: 0 },
    surgeMultiplier: { type: Number, default: 1 },

    // Add-on services (Loading/Unloading)
    addons: [BookingAddonSchema],
    addonTotal: { type: Number, default: 0 },

    // Loading/Unloading specific
    loadingUnloading: {
      type: {
        type: String,
        enum: ["LOADING", "UNLOADING", "BOTH", "NONE"],
        default: "NONE",
      },
      pickupFloor: Number,
      dropFloor: Number,
      charge: { type: Number, default: 0 },
    },

    // Waiting charges
    waitingMinutes: { type: Number, default: 0 },
    waitingCharge: { type: Number, default: 0 },

    // Toll and other charges
    tollCharges: { type: Number, default: 0 },
    parkingCharges: { type: Number, default: 0 },

    // Promo/Discount
    promoCodeId: { type: Schema.Types.ObjectId, ref: "PromoCode" },
    promoCode: String,
    promoDiscount: { type: Number, default: 0 },

    // Coins
    coinsUsed: { type: Number, default: 0 },
    coinDiscount: { type: Number, default: 0 },
    coinsEarned: { type: Number, default: 0 },

    // Enterprise discount
    enterpriseDiscount: { type: Number, default: 0 },

    // Tax
    gstAmount: { type: Number, default: 0 },
    gstPercentage: { type: Number, default: 5 },

    // Final amounts
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    fare: { type: Number, required: true }, // Deprecated, use finalFare
    finalFare: { type: Number, required: true },
    discount: { type: Number, default: 0 }, // Deprecated, use totalDiscount

    // Status
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SEARCHING",
        "ASSIGNED",
        "DRIVER_ARRIVED",
        "PICKED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "SEARCHING",
      index: true,
    },

    // Payment
    paymentMethod: {
      type: String,
      enum: [
        "CASH",
        "WALLET",
        "CARD",
        "UPI",
        "GOOGLE_PAY",
        "PAYTM",
        "PHONEPE",
        "ENTERPRISE_CREDIT",
      ],
      default: "CASH",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      default: "PENDING",
      index: true,
    },
    paymentTransactionId: String,

    // Cancellation
    cancellationReasonId: {
      type: Schema.Types.ObjectId,
      ref: "CancellationReason",
    },
    cancellationReason: String,
    cancelledBy: {
      type: String,
      enum: ["USER", "DRIVER", "SYSTEM"],
    },
    cancellationFee: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    refundStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PROCESSED", "FAILED"],
      default: "NONE",
    },

    // Rating & Feedback
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedback: String,
    driverRatingForUser: Number, // Driver rates user

    // Scheduling
    isScheduled: { type: Boolean, default: false, index: true },
    scheduledAt: Date,
    scheduledSlot: String,

    // Timestamps
    assignedAt: Date,
    driverArrivedAt: Date,
    pickedAt: Date,
    completedAt: Date,
    cancelledAt: Date,

    // ETA
    estimatedArrivalTime: Number, // in minutes
    estimatedPickupTime: Date,
    estimatedDropTime: Date,

    // OTP for verification
    otp: {
      type: String,
      length: 4,
    },

    // Consignment/Invoice
    consignmentNumber: String,
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },

    // Driver vehicle info at time of booking
    vehicleNumber: String,
    vehicleModel: String,

    // Tracking
    trackingUrl: String,
    liveLocation: {
      lat: Number,
      lng: Number,
      updatedAt: Date,
    },
  },
  { timestamps: true },
);

// Compound indexes
BookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
BookingSchema.index({ driverId: 1, status: 1, createdAt: -1 });
BookingSchema.index({ status: 1, createdAt: -1 });
BookingSchema.index({ paymentStatus: 1, status: 1 });

export default mongoose.model<IBooking>("Booking", BookingSchema);
