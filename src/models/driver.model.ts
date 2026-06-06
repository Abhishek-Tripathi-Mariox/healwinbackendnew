import mongoose, { Schema } from "mongoose";
import { IDriver } from "../interfaces/driver";

const DriverSchema = new Schema<IDriver>(
  {
    mobileNumber: {
      type: String,
      required: true,
      match: [/^[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number"],
    },

    countryCode: {
      type: String,
      default: "+91",
    },

    fullName: {
      type: String,
      // required: true,
      default: "",
      trim: true,
    },

    bloodGroup: {
      type: String,
      // required: true,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },

    gender: {
      type: String,
      default: "Male",
      enum: ["Male", "Female", "Other"],
    },

    dob: String,

    district: {
      type: String,
      // required: true,
      default: "",
    },

    state: {
      type: String,
      // required: true,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "draft",
        "documents_uploaded",
        "vehicle_added",
        "under_verification",
        "approved",
        "rejected",
        "suspended",
      ],
      default: "draft",
      index: true,
    },

    rejectionReason: String,
    suspensionReason: String,

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: Date,
    currentBookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRides: {
      type: Number,
      default: 0,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    isNotificationEnabled: {
      type: Boolean,
      default: true,
    },

    // Profile photo
    profilePhoto: String,

    // Languages
    languages: [String],

    // Bank Details
    bankDetails: {
      accountHolderName: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      isVerified: { type: Boolean, default: false },
    },

    // Addresses
    addresses: [
      {
        type: { type: String, enum: ["current", "permanent"] },
        addressLine1: String,
        addressLine2: String,
        district: String,
        state: String,
        pincode: String,
        country: { type: String, default: "India" },
      },
    ],

    // Referral
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "Driver" },

    // Training
    completedLessons: [String],
    trainingCompletedAt: Date,

    // Badges
    unlockedBadges: [String],

    // Onboarding Payment
    onboardingFeePaid: { type: Boolean, default: false },
    onboardingPaymentId: String,

    // Instructions
    instructionsAcknowledgedAt: Date,

    // Daily Checklist
    lastChecklistAt: Date,
    lastChecklistImages: [String],
  },
  { timestamps: true },
);

// Compound indexes
DriverSchema.index({ isOnline: 1, status: 1, isActive: 1 });
DriverSchema.index({ mobileNumber: 1, countryCode: 1 });

export default mongoose.model<IDriver>("Driver", DriverSchema);
