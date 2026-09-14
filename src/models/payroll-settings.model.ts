import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — payroll cycle configuration. A single document; there is one payroll
 * calendar for the organisation.
 */
export interface IPayrollSettings {
  _id: Types.ObjectId;
  /**
   * Day of the month a payroll period begins.
   *
   * 1 is an ordinary calendar month. 16 gives the hospital's cycle: a run for
   * September covers 16 September to 15 October, and is named after the month
   * it starts in.
   */
  cycleStartDay: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollSettingsSchema = new Schema<IPayrollSettings>(
  {
    cycleStartDay: { type: Number, default: 16, min: 1, max: 31 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const PayrollSettings = mongoose.model<IPayrollSettings>(
  "PayrollSettings",
  PayrollSettingsSchema,
);

export default PayrollSettings;
