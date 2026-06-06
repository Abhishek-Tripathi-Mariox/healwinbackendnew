import mongoose, { Schema } from "mongoose";
import { IDriverLocation } from "../interfaces/driver-location";

const DriverLocationSchema = new Schema<IDriverLocation>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
      unique: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    heading: { type: Number, min: 0, max: 360 },
    speed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Geospatial index for location-based queries
DriverLocationSchema.index({ location: "2dsphere" });
DriverLocationSchema.index({ driverId: 1, updatedAt: -1 });

export default mongoose.model<IDriverLocation>(
  "DriverLocation",
  DriverLocationSchema
);
