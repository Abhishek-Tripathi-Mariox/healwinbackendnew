import { Types } from "mongoose";

export type BookingStatus =
  | "DRAFT"
  | "SEARCHING"
  | "ASSIGNED"
  | "DRIVER_ARRIVED"
  | "PICKED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "SCHEDULED"
  | "PENDING";

export type PaymentMethod =
  | "CASH"
  | "WALLET"
  | "CARD"
  | "UPI"
  | "GOOGLE_PAY"
  | "PAYTM"
  | "PHONEPE"
  | "ENTERPRISE_CREDIT";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type CancelledBy = "USER" | "DRIVER" | "SYSTEM";
export type ServiceType = "WITHIN_CITY" | "OUTSTATION";
export type GoodsType = "BUSINESS" | "PERSONAL";
export type LoadingUnloadingType = "LOADING" | "UNLOADING" | "BOTH" | "NONE";
export type RefundStatus = "NONE" | "PENDING" | "PROCESSED" | "FAILED";

export interface ILocation {
  address: string;
  lat: number;
  lng: number;
  contactName?: string;
  contactPhone?: string;
  floor?: number;
  isLiftAvailable?: boolean;
}

export interface IBookingAddon {
  addonId?: Types.ObjectId;
  name?: string;
  price?: number;
  quantity?: number;
}

export interface ILoadingUnloading {
  type: LoadingUnloadingType;
  pickupFloor?: number;
  dropFloor?: number;
  charge?: number;
}

export interface IBooking {
  _id?: Types.ObjectId;
  bookingNumber?: string;
  userId: Types.ObjectId;
  driverId?: Types.ObjectId;
  enterpriseId?: Types.ObjectId;
  vehicleTypeId: Types.ObjectId;

  // Service type
  serviceType?: ServiceType;

  // Locations
  pickup: ILocation;
  drop: ILocation;
  stops?: ILocation[];

  // Goods
  goodsType?: GoodsType;
  goodsDescription?: string;
  goodsWeight?: number;
  goodsQuantity?: number;

  // Fare breakdown
  distanceKm: number;
  durationMin: number;
  baseFare: number;
  distanceCharge?: number;
  timeCharge?: number;
  surgeFare?: number;
  surgeMultiplier?: number;

  // Addons
  addons?: IBookingAddon[];
  addonTotal?: number;
  loadingUnloading?: ILoadingUnloading;

  // Waiting & tolls
  waitingMinutes?: number;
  waitingCharge?: number;
  tollCharges?: number;
  parkingCharges?: number;

  // Promo
  promoCodeId?: Types.ObjectId;
  promoCode?: string;
  promoDiscount?: number;

  // Coins
  coinsUsed?: number;
  coinDiscount?: number;
  coinsEarned?: number;

  // Enterprise
  enterpriseDiscount?: number;

  // Tax
  gstAmount?: number;
  gstPercentage?: number;

  // Final amounts
  subtotal: number;
  totalDiscount?: number;
  fare: number;
  finalFare: number;
  discount?: number;

  // Status
  status: BookingStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentTransactionId?: string;

  // Cancellation
  cancellationReasonId?: Types.ObjectId;
  cancellationReason?: string;
  cancelledBy?: CancelledBy;
  cancellationFee?: number;
  refundAmount?: number;
  refundStatus?: RefundStatus;

  // Rating
  rating?: number;
  feedback?: string;
  review?: string;
  driverRatingForUser?: number;

  // Timestamps
  scheduledAt?: Date;
  isScheduled?: boolean;
  scheduledSlot?: string;
  assignedAt?: Date;
  driverArrivedAt?: Date;
  pickedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  estimatedArrivalTime?: number;
  estimatedDuration?: number;
  estimatedPickupTime?: Date;
  estimatedDropTime?: Date;
  otp?: string;

  // Invoice & Consignment
  invoiceId?: Types.ObjectId;
  consignmentNumber?: string;

  // Driver vehicle info at time of booking
  vehicleNumber?: string;
  vehicleModel?: string;

  // Tracking
  trackingUrl?: string;
  liveLocation?: {
    lat: number;
    lng: number;
    updatedAt: Date;
  };

  createdAt?: Date;
  updatedAt?: Date;
}
