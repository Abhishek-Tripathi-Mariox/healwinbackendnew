import mongoose, { Schema, Types } from "mongoose";

/**
 * HR — Attendance geofence location.
 *
 * The radius used to be one hardcoded 0.5 km constant applied everywhere. A
 * hospital campus, a small centre and an ambulance parking bay are not the
 * same size, so the radius is per-location, and each location can be limited
 * to the employee categories that actually report there (§4.2 / §4.4).
 *
 * An employee whose category matches NO location is not blocked — attendance
 * is recorded with `withinGeofence` unset. Geofencing is evidence for HR, not
 * a gate on someone's pay.
 */

export interface IGeofenceLocation {
  _id: Types.ObjectId;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Empty = applies to every employee category. */
  employeeCategories: string[];
  /** Optional link to the Centre/hospital this fence belongs to. */
  centreId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GeofenceLocationSchema = new Schema<IGeofenceLocation>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radiusMeters: { type: Number, required: true, default: 500 },
    employeeCategories: [{ type: String, trim: true }],
    centreId: { type: Schema.Types.ObjectId, ref: "Centre" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const GeofenceLocation = mongoose.model<IGeofenceLocation>(
  "GeofenceLocation",
  GeofenceLocationSchema,
);

export default GeofenceLocation;
