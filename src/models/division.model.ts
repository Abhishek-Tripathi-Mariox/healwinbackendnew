import mongoose, { Schema, Types, Document } from "mongoose";

export interface IDivision extends Document {
  _id: Types.ObjectId;
  name: string;
  district: Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const DivisionSchema = new Schema<IDivision>(
  {
    name: { type: String, required: true, trim: true },
    district: { type: Schema.Types.ObjectId, ref: "District", required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

DivisionSchema.index({ district: 1, isActive: 1, sortOrder: 1 });
DivisionSchema.index({ name: 1, district: 1 }, { unique: true });

export const Division = mongoose.model<IDivision>("Division", DivisionSchema);
export default Division;
