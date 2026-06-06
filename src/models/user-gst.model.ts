import mongoose, { Schema, Types } from "mongoose";

export interface IUserGST {
  userId: Types.ObjectId;
  gstin: string;
  businessName?: string;
  isActive: boolean;
}

const UserGSTSchema = new Schema<IUserGST>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    gstin: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    businessName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUserGST>("UserGST", UserGSTSchema);
