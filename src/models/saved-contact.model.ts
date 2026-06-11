import mongoose, { Schema, Types } from "mongoose";

/**
 * Patient-app saved contact — a reusable "book for someone else" recipient,
 * like a parcel app's saved address book. Each row belongs to the patient
 * (userId) who created it. When booking an ambulance the patient can pick a
 * saved contact (name + phone + optional address/location) so the crew and
 * admin know who they're picking up, and the contact is remembered for reuse.
 *
 * This is deliberately separate from PatientFamilyMember: family members are
 * relatives with medical context (blood group, conditions); saved contacts are
 * any third party (a friend, a neighbour, an elderly parent at another address).
 */
export interface ISavedContact {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  phone: string;
  relation?: string;
  address?: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SavedContactSchema = new Schema<ISavedContact>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    relation: { type: String, trim: true },
    address: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const SavedContact = mongoose.model<ISavedContact>(
  "SavedContact",
  SavedContactSchema,
);

export default SavedContact;
