import mongoose, { Schema } from "mongoose";
import { IAmbulanceStaff } from "../interfaces/ambulance-staff";
import { SalaryStructureSchema } from "./hr-employee.model";

/**
 * A GPS point, or nothing at all.
 *
 * Written as an inline object with `type` defaulting to "Point", every new
 * crew member was born carrying `{ type: "Point" }` and no coordinates —
 * which the 2dsphere index rejects outright ("Point must be an array or
 * object, instead got type missing"), so creating staff failed entirely.
 *
 * A sub-schema with `default: undefined` is not created until something is
 * actually assigned to it, so a crew member who has never pinged simply has
 * no location — which is the truth, and what the index wants to see.
 *
 * Note the Ambulance model gets away with the inline form only because its
 * coordinates default to [0,0]. That is a VALID point and a false one: it
 * is the null-island origin, and measuring against it is what produced
 * distances like "8778 km". Hence the absent-by-default shape here.
 */
const GeoPointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const AmbulanceStaffSchema = new Schema<IAmbulanceStaff>(
  {
    mobileNumber: {
      type: String,
      required: true,
      match: [/^[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number"],
    },
    countryCode: { type: String, default: "+91" },
    role: {
      type: String,
      enum: ["driver", "attendant"],
      required: true,
      index: true,
    },
    // Employer link. Mutually exclusive in practice:
    //   - drivers   → providerId set (Service Provider operates the fleet)
    //   - attendants → hospitalId set (Centre Locator row — paramedics
    //     and MTs are employed by the hospital, not the ambulance
    //     operator)
    // The pre-save validator below enforces "exactly one of {provider,
    // hospital}" so neither field is left orphaned and we don't get
    // ambiguous records.
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "AmbulanceServiceProvider",
      default: null,
      index: true,
    },
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: "Centre",
      default: null,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    dob: String,
    profilePhoto: String,
    licenseNumber: String,
    licenseImage: String,
    certifications: [String],
    certificationImages: [String],
    fcmToken: { type: String, default: null },
    isOnline: { type: Boolean, default: false, index: true },
    isDutyOn: { type: Boolean, default: false },
    lastSeenAt: Date,
    // Set every time the device hits /ambulance-staff/location, BEFORE
    // any role / assignment check. Lets the admin detail page show
    // "the app is trying" vs "the app isn't sending anything" —
    // distinguishing a code/permission problem on the device from a
    // backend filter dropping the ping.
    lastLocationAttemptAt: Date,
    // The crew member's own last position. The vehicle's `currentLocation`
    // is written by whichever crew member pinged, so it cannot answer
    // "where is the ASSIGNED DRIVER?" — dispatch ranks on that, and an
    // attendant's phone sitting at home must not stand in for the vehicle.
    currentLocation: { type: GeoPointSchema, default: undefined },
    lastLocationAt: Date,
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false },
    // Optional monthly salary structure — when set, the crew member is included
    // in the central HR payroll run (paid like an employee, days from central
    // attendance).
    salaryStructure: { type: SalaryStructureSchema, default: undefined },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

AmbulanceStaffSchema.index(
  { mobileNumber: 1, countryCode: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
AmbulanceStaffSchema.index({ providerId: 1, role: 1 });
AmbulanceStaffSchema.index({ hospitalId: 1, role: 1 });
AmbulanceStaffSchema.index({ isOnline: 1, isActive: 1 });
AmbulanceStaffSchema.index({ currentLocation: "2dsphere" });

// "Exactly one employer" invariant. Reject saves that try to set both
// providerId AND hospitalId (the staff member would be billable twice),
// or neither (orphan). Existing rows that already have providerId from
// before this rule existed pass through fine — the check only runs on
// new saves.
AmbulanceStaffSchema.pre("save", async function () {
  const hasProvider = !!this.providerId;
  const hasHospital = !!this.hospitalId;
  if (hasProvider && hasHospital) {
    throw new Error(
      "Staff cannot belong to both a service provider and a hospital",
    );
  }
  if (!hasProvider && !hasHospital) {
    throw new Error(
      "Staff must belong to either a service provider or a hospital",
    );
  }
});

export default mongoose.model<IAmbulanceStaff>(
  "AmbulanceStaff",
  AmbulanceStaffSchema,
);
