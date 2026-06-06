import mongoose, { Schema, Types } from "mongoose";

export interface ICareer {
  _id: Types.ObjectId;
  title: string;
  department: string;
  location: string;
  type: string;
  experience: string;
  salary?: string;
  qualification: string;
  rolesAndResponsibilities: string[];
  states: Types.ObjectId[];
  districts: Types.ObjectId[];
  cardColor?: string;
  isActive: boolean;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CareerSchema = new Schema<ICareer>(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    type: { type: String, required: true, trim: true },
    experience: { type: String, required: true, trim: true },
    salary: { type: String, trim: true },
    qualification: { type: String, required: true, trim: true },
    rolesAndResponsibilities: { type: [String], default: [] },
    states: [{ type: Schema.Types.ObjectId, ref: "State" }],
    districts: [{ type: Schema.Types.ObjectId, ref: "District" }],
    cardColor: { type: String, default: "#2563eb" },
    isActive: { type: Boolean, default: true, index: true },
    postedAt: { type: Date },
  },
  { timestamps: true },
);

CareerSchema.index({ title: 1, department: 1 });
CareerSchema.index({ isActive: 1, postedAt: -1 });

export const Career = mongoose.model<ICareer>("Career", CareerSchema);
