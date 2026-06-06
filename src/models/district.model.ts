import mongoose, { Schema, Types, Document } from "mongoose";

export interface IDistrict extends Document {
  _id: Types.ObjectId;
  name: string;
  state: Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const DistrictSchema = new Schema<IDistrict>(
  {
    name: { type: String, required: true, trim: true },
    state: { type: Schema.Types.ObjectId, ref: "State", required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "cities" },
);

DistrictSchema.index({ state: 1, isActive: 1, sortOrder: 1 });
DistrictSchema.index({ name: 1, state: 1 }, { unique: true });

export const District = mongoose.model<IDistrict>("District", DistrictSchema);
export default District;
