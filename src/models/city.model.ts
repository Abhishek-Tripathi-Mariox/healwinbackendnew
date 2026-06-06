import mongoose, { Schema, Types, Document } from "mongoose";

export interface ICity extends Document {
  _id: Types.ObjectId;
  name: string;
  state: Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const CitySchema = new Schema<ICity>(
  {
    name: { type: String, required: true, trim: true },
    state: { type: Schema.Types.ObjectId, ref: "State", required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

CitySchema.index({ state: 1, isActive: 1, sortOrder: 1 });
CitySchema.index({ name: 1, state: 1 }, { unique: true });

export const City = mongoose.model<ICity>("City", CitySchema);
export default City;
