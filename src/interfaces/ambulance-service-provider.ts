import { Document, Types } from "mongoose";

export interface IAmbulanceServiceProvider extends Document {
  _id: Types.ObjectId;
  name: string;
  contactPersonName: string;
  phone: string;
  email?: string;
  address?: string;
  state: Types.ObjectId;
  district: Types.ObjectId;
  gstin?: string;
  isActive: boolean;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
