import mongoose, { Schema, Types, Document } from "mongoose";

export interface IDepartment extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

DepartmentSchema.index({ isActive: 1, sortOrder: 1 });

export const Department = mongoose.model<IDepartment>(
  "Department",
  DepartmentSchema,
);
export default Department;
