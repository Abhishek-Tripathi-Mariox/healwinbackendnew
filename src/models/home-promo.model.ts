import mongoose, { Schema, Types } from "mongoose";

/**
 * Patient-app home "promo" shortcut cards (the swipeable carousel on the home
 * screen). Admin-managed so marketing can change copy/order/targets without an
 * app release. `target` is one of the app's known route names; the app ignores
 * any promo whose target it doesn't recognise.
 */
export interface IHomePromo {
  _id: Types.ObjectId;
  titleTop: string;
  titleBold: string[];
  cta: string;
  target: string; // app route, e.g. "AmbulanceTypes" | "PlanAmbulance" | "Membership"
  image?: string;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HomePromoSchema = new Schema<IHomePromo>(
  {
    titleTop: { type: String, default: "" },
    titleBold: { type: [String], default: [] },
    cta: { type: String, default: "Book Now" },
    target: { type: String, required: true },
    image: String,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
HomePromoSchema.index({ isActive: 1, isDeleted: 1, sortOrder: 1 });

export const HomePromo = mongoose.model<IHomePromo>("HomePromo", HomePromoSchema);
export default HomePromo;
