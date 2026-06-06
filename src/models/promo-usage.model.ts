import mongoose, { Schema, Types } from "mongoose";

export interface IPromoUsage {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  promoCodeId: Types.ObjectId;
  bookingId: Types.ObjectId;
  discountAmount: number;
  usedAt: Date;
}

const PromoUsageSchema = new Schema<IPromoUsage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    promoCodeId: {
      type: Schema.Types.ObjectId,
      ref: "PromoCode",
      required: true,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Compound indexes for quick user promo usage lookup
PromoUsageSchema.index({ userId: 1, promoCodeId: 1 });

export default mongoose.model<IPromoUsage>("PromoUsage", PromoUsageSchema);
