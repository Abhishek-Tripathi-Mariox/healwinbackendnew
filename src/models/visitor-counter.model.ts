import mongoose, { Schema, Document } from "mongoose";

interface IVisitorCounter extends Document {
  totalCount: number;
}

const VisitorCounterSchema = new Schema<IVisitorCounter>(
  {
    totalCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const VisitorCounter = mongoose.model<IVisitorCounter>(
  "VisitorCounter",
  VisitorCounterSchema,
);
