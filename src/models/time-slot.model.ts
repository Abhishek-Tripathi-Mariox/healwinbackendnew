import mongoose, { Schema, Types } from "mongoose";

export interface ITimeSlot {
  _id: Types.ObjectId;
  label: string;
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  isActive: boolean;
  maxBookings: number; // Max bookings per slot
  surgeMultiplier: number;
  sortOrder: number;
}

export interface IScheduleConfig {
  _id: Types.ObjectId;
  advanceBookingDays: number; // How many days in advance can book
  minAdvanceHours: number; // Minimum hours before scheduled time
  maxScheduledPerDay: number; // Max scheduled bookings per day
  isSchedulingEnabled: boolean;
}

// Time Slot Schema
const TimeSlotSchema = new Schema<ITimeSlot>(
  {
    label: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    maxBookings: {
      type: Number,
      default: 100,
    },
    surgeMultiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Schedule Config Schema (singleton)
const ScheduleConfigSchema = new Schema<IScheduleConfig>(
  {
    advanceBookingDays: {
      type: Number,
      default: 7,
      min: 1,
      max: 30,
    },
    minAdvanceHours: {
      type: Number,
      default: 2,
      min: 1,
    },
    maxScheduledPerDay: {
      type: Number,
      default: 1000,
    },
    isSchedulingEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export const TimeSlot = mongoose.model<ITimeSlot>("TimeSlot", TimeSlotSchema);
export const ScheduleConfig = mongoose.model<IScheduleConfig>(
  "ScheduleConfig",
  ScheduleConfigSchema,
);
