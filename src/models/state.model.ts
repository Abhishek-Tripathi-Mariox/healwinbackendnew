import mongoose, { Schema, Types, Document } from "mongoose";

export interface IState extends Document {
  _id: Types.ObjectId;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const StateSchema = new Schema<IState>(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

StateSchema.index({ isActive: 1, sortOrder: 1 });
StateSchema.index({ name: 1 });

export const State = mongoose.model<IState>("State", StateSchema);
export default State;
