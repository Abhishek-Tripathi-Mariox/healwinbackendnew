import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — compensatory off ledger.
 *
 * A hospital works through public holidays, so staff rostered on one are owed
 * a day back. HR grants those by hand after checking who actually worked, and
 * every grant is recorded here rather than as a bare adjustment to a balance:
 * an employee asking "why do I have three comp-offs?" needs an answer, and a
 * balance number alone cannot give one.
 *
 * Balance for an employee = sum of credited days − sum of consumed days.
 */

export interface ICompOff {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  /** The holiday (or extra day) worked, which is what earned the credit. */
  workedOn: Date;
  /** The holiday record this was granted against, when there is one. */
  holidayId?: Types.ObjectId;
  /** Days granted. Half a day is allowed for a half shift. */
  days: number;
  /** Days taken so far out of this credit. */
  used: number;
  reason?: string;
  /** Set once fully used or written off, so it stops counting. */
  status: "available" | "used" | "expired" | "cancelled";
  grantedByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CompOffSchema = new Schema<ICompOff>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "HrEmployee",
      required: true,
      index: true,
    },
    workedOn: { type: Date, required: true },
    holidayId: { type: Schema.Types.ObjectId, ref: "Holiday" },
    days: { type: Number, required: true, min: 0.5, max: 5 },
    used: { type: Number, default: 0, min: 0 },
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["available", "used", "expired", "cancelled"],
      default: "available",
      index: true,
    },
    grantedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// The same employee must not be granted twice for the same worked day. Partial
// rather than sparse: sparse still indexes explicit nulls and would collide on
// the second one.
CompOffSchema.index(
  { employeeId: 1, workedOn: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["available", "used"] } },
  },
);
CompOffSchema.index({ employeeId: 1, status: 1, createdAt: -1 });
CompOffSchema.index({ createdAt: -1 });

export const CompOff = mongoose.model<ICompOff>("CompOff", CompOffSchema);
export default CompOff;
