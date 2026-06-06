import mongoose, { Schema, Types, Document } from "mongoose";

export interface IDesignation extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const DesignationSchema = new Schema<IDesignation>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

DesignationSchema.index({ isActive: 1, sortOrder: 1 });

export const Designation = mongoose.model<IDesignation>(
  "Designation",
  DesignationSchema,
);
export default Designation;
