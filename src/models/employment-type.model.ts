import mongoose, { Schema, Types, Document } from "mongoose";

export interface IEmploymentType extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  /** On HealWin's own payroll vs engaged on a contract basis. */
  engagement: "payroll" | "contract";
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const EmploymentTypeSchema = new Schema<IEmploymentType>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "", trim: true },
    engagement: { type: String, enum: ["payroll", "contract"], default: "payroll" },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

EmploymentTypeSchema.index({ isActive: 1, sortOrder: 1 });

export const EmploymentType = mongoose.model<IEmploymentType>(
  "EmploymentType",
  EmploymentTypeSchema,
);
export default EmploymentType;
