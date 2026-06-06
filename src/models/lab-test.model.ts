import mongoose, { Schema, Types } from "mongoose";

/**
 * Lab test (patient-app "Lab Tests"). Managed from the admin panel; surfaced
 * read-only to the patient app via /patient/lab/tests.
 */
export interface ILabTest {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  mrp?: number;
  category?: string;
  sampleType?: string;
  reportHours: number;
  homeCollection: boolean;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LabTestSchema = new Schema<ILabTest>(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, default: 0 },
    mrp: Number,
    category: { type: String, trim: true, index: true },
    sampleType: { type: String, trim: true, default: "Blood" },
    reportHours: { type: Number, default: 24 },
    homeCollection: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

LabTestSchema.index({ name: "text" });

export const LabTest = mongoose.model<ILabTest>("LabTest", LabTestSchema);
export default LabTest;
