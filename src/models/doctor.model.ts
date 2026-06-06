import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor (patient-app "Consult a Doctor"). Managed from the admin panel and
 * surfaced read-only to the patient app via /patient/doctors.
 */
export interface IDoctor {
  _id: Types.ObjectId;
  name: string;
  speciality: string;
  qualification?: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  consultationFee: number;
  photo?: string;
  hospital?: string;
  languages?: string[];
  teleconsult: boolean;
  about?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    name: { type: String, required: true, trim: true, index: true },
    speciality: { type: String, required: true, trim: true, index: true },
    qualification: { type: String, trim: true },
    experienceYears: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    consultationFee: { type: Number, default: 0 },
    photo: String,
    hospital: { type: String, trim: true },
    languages: { type: [String], default: [] },
    teleconsult: { type: Boolean, default: true },
    about: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

DoctorSchema.index({ name: "text", speciality: "text" });

export const Doctor = mongoose.model<IDoctor>("Doctor", DoctorSchema);
export default Doctor;
