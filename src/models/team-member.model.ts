import mongoose, { Schema, Types } from "mongoose";

export interface ITeamMember {
  _id: Types.ObjectId;
  uniqueId: string;
  name: string;
  designation: string;
  division: string;
  department: string;
  state?: string;
  image?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  bio?: string;
  highlights: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>(
  {
    uniqueId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    division: { type: String, trim: true },
    department: { type: String, trim: true },
    state: { type: String, trim: true },
    image: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    bio: { type: String, trim: true },
    highlights: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

TeamMemberSchema.index({ division: 1 });
TeamMemberSchema.index({ department: 1 });
TeamMemberSchema.index({ isActive: 1, sortOrder: 1 });

export const TeamMember = mongoose.model<ITeamMember>(
  "TeamMember",
  TeamMemberSchema,
);
