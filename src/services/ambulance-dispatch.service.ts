import mongoose, { Types } from "mongoose";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import { SOSAlert } from "../models/sos.model";
import { SOSSubmission } from "../models/sos-submission.model";
import { AmbulanceRequest } from "../models/ambulance-request.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import User from "../models/Users";
import VehicleType from "../models/vehicle-type.model";
import { calculateFare } from "./fare.service";
import { OTP_LENGTH } from "../utils/helpers";
import { attendantIdsOf } from "../utils/crew.util";
import { roadLegs } from "./distance-matrix.service";
import config from "../config";

// Pickup-verification code — the patient reads it out to the crew once they
// arrive, driver enters it to start the trip. Previously SOS dispatches never
// minted one (deliberately, for speed), but that's since been reversed — SOS
// now gets the same real verification step as a booked ride. Length comes from
// the shared OTP_LENGTH so it stays in step with the driver app's input.
export const mintOtp = (): string =>
  String(
    Math.floor(
      10 ** (OTP_LENGTH - 1) +
        Math.random() * 9 * 10 ** (OTP_LENGTH - 1),
    ),
  );

/**
 * SOS has no patient-selected VehicleType — resolve one from the assigned
 * ambulance's free-form `ambulanceType` (e.g. "BLS") so the trip can be
 * billed on the same real fare engine as a booked ride, not a flat
 * placeholder. Admin-managed VehicleType names are usually the long form
 * ("Basic Life Support (BLS)"), so match on an exact name OR the
 * abbreviation appearing in parentheses before falling back to a
 * starts-with match. Returns null (never throws) if nothing resolves —
 * callers treat a missing vehicle type as "can't bill this trip yet".
 */
const resolveVehicleTypeForAmbulance = async (ambulanceType?: string) => {
  const raw = String(ambulanceType || "").trim();
  if (!raw) return null;
  const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return VehicleType.findOne({
    isDeleted: { $ne: true },
    $or: [
      { name: new RegExp(`^${esc}$`, "i") },
      { name: new RegExp(`\\(${esc}\\)`, "i") },
      { name: new RegExp(`^${esc}\\b`, "i") },
    ],
  });
};

/**
 * Resolve the patient behind an SOS id — works whether the id is a
 * SOSSubmission, a SOSAlert, or an emergency AmbulanceRequest. Returns the
 * app user (for notify + live tracking), plus a display name and pickup
 * address to denormalise onto the dispatch (so the driver app shows a real
 * name + location, not an id or raw coordinates).
 */
const resolveSosPatient = async (
  sosId: Types.ObjectId,
): Promise<{
  patientUserId?: Types.ObjectId;
  patientName?: string;
  patientPhone?: string;
  pickupAddress?: string;
}> => {
  const sub: any = await SOSSubmission.findById(sosId)
    .select("userId name phone address")
    .lean();
  if (sub) {
    return {
      patientUserId: sub.userId,
      patientName: sub.name,
      patientPhone: sub.phone,
      pickupAddress: sub.address,
    };
  }
  const alert: any = await SOSAlert.findById(sosId)
    .select("userId name address")
    .lean();
  if (alert) {
    // Older SOSAlerts may not carry a name — fall back to the linked User so
    // the dispatch shows the patient's name, never a bare id. The same lookup
    // yields the callback number, which a SOSAlert never stores itself.
    let patientName: string | undefined = alert.name;
    let patientPhone: string | undefined;
    if (alert.userId) {
      const u: any = await User.findById(alert.userId)
        .select("fullName mobileNumber")
        .lean();
      if (!patientName) patientName = u?.fullName;
      patientPhone = u?.mobileNumber;
    }
    return {
      patientUserId: alert.userId,
      patientName,
      patientPhone,
      pickupAddress: alert.address,
    };
  }
  const reqDoc: any = await AmbulanceRequest.findById(sosId)
    .select("userId patientName recipientPhone pickup")
    .lean();
  if (reqDoc) {
    // "Booked for someone else" — ring the person being picked up, falling
    // back to the account holder who raised the request.
    let patientPhone: string | undefined = reqDoc.recipientPhone;
    if (!patientPhone && reqDoc.userId) {
      const u: any = await User.findById(reqDoc.userId)
        .select("mobileNumber")
        .lean();
      patientPhone = u?.mobileNumber;
    }
    return {
      patientUserId: reqDoc.userId,
      patientName: reqDoc.patientName,
      patientPhone,
      pickupAddress: reqDoc.pickup?.address,
    };
  }
  return {};
};

export interface NearbyAmbulance {
  ambulanceId: string;
  providerId: string;
  providerName: string;
  registrationNumber: string;
  ambulanceType: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  /** The first attendant, kept so existing callers keep working. */
  attendantId: string;
  attendantName: string;
  /** Everyone riding along — a transfer can carry more than one. */
  attendants: { id: string; name: string }[];
  ambulanceLocation: { lat: number; lng: number };
  /**
   * Whose fix the position came from. The vehicle is ranked on where its
   * ASSIGNED DRIVER is; an attendant's phone is a fallback and says so, so
   * a dispatcher is never shown a confident distance measured from someone
   * who is not driving.
   */
  locationSource: "driver" | "attendant" | "none";
  /** Minutes since that fix. Null when there is no position at all. */
  locationAgeMin: number | null;
  straightLineKm: number;
  /**
   * Driving distance where Google could route it, otherwise a copy of the
   * crow-flies figure. `distanceSource` says which, so the screen never
   * presents an estimate as a measurement.
   */
  roadDistanceKm: number;
  distanceSource: "road" | "straight-line";
  etaMinutes: number;
}

/**
 * A GPS fix we can actually measure against.
 *
 * A vehicle that has never pinged carries [0,0] — that is not a position, it
 * is the null-island origin, and measuring against it produced distances like
 * "8778 km". Anything off the globe is rejected the same way.
 */
const realFix = (point: any): { lat: number; lng: number } | null => {
  const lat = point?.coordinates?.[1];
  const lng = point?.coordinates?.[0];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

/** How stale a fix is, so the dispatcher can judge the distance shown. */
const minutesSince = (at: any): number | null => {
  const t = at ? new Date(at).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
};

/**
 * Every dispatchable ambulance, nearest to the patient first.
 *
 * Distance is measured from the ASSIGNED DRIVER's last GPS fix. The vehicle
 * carries a `currentLocation` too, but any crew member overwrites it, so
 * ranking on it can place a vehicle by an attendant's phone that never left
 * home. The vehicle's own fix is kept only as a fallback, flagged as such.
 *
 * `maxDistanceKm` caps the search radius; 0 disables the cap. A vehicle with
 * no position at all is never excluded by the radius — there is nothing to
 * measure — it just sorts last.
 */
export const getNearbyAmbulances = async (
  patientLat: number,
  patientLng: number,
  excludeAmbulanceIds: Types.ObjectId[] = [],
  limit = 10,
  maxDistanceKm = 10,
): Promise<NearbyAmbulance[]> => {
  // GPS-OPTIONAL MODE (live GPS not available yet): we no longer require a
  // fresh ambulance location to dispatch. We list every eligible ambulance
  // (active, available, both crew seats assigned, crew not deleted). A vehicle's
  // position is whatever its assigned driver last reported (Ambulance
  // .currentLocation is written from the driver's pings); when that exists we
  // show distance/ETA, otherwise distance is unknown (0) and the radius cap is
  // skipped. The old $geoNear path is gone because it silently dropped every
  // vehicle without a location.
  const pipeline: any[] = [
    {
      $match: {
        // status:"available" already excludes on_dispatch / offline / maintenance.
        status: "available",
        isActive: true,
        // A driver is required (someone must drive); the attendant is OPTIONAL
        // (BLS / driver-only vehicles are dispatchable too).
        assignedDriverId: { $ne: null },
        ...(excludeAmbulanceIds.length > 0
          ? { _id: { $nin: excludeAmbulanceIds } }
          : {}),
      },
    },
    {
      $lookup: {
        from: "ambulancestaffs",
        localField: "assignedDriverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: "$driver" },
    {
      // A vehicle can carry several attendants, and older rows carry one in
      // the legacy single field — join on both and keep the result as a LIST.
      $lookup: {
        from: "ambulancestaffs",
        let: {
          ids: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$assignedAttendantIds", []] } }, 0] },
              "$assignedAttendantIds",
              { $cond: [{ $ifNull: ["$assignedAttendantId", false] }, ["$assignedAttendantId"], []] },
            ],
          },
        },
        pipeline: [{ $match: { $expr: { $in: ["$_id", "$$ids"] } } }],
        as: "attendants",
      },
    },
    {
      $match: {
        "driver.isActive": true,
        "driver.isDeleted": { $ne: true },
        // The assigned DRIVER must be on duty — an ambulance with an off-duty
        // driver can't actually roll, so it must not be offered for dispatch
        // (and the off-duty driver must not be rung). The attendant seat stays
        // optional.
        "driver.isOnline": true,
      },
    },
    {
      $lookup: {
        from: "ambulanceserviceproviders",
        localField: "providerId",
        foreignField: "_id",
        as: "provider",
      },
    },
    // Provider is optional — hospital-owned ambulances have no service provider.
    { $unwind: { path: "$provider", preserveNullAndEmptyArrays: true } },
    // NO narrowing limit here. Distance is worked out below, in JS, so a cut
    // made at this point is made before anything knows which vehicle is
    // closest: Mongo would hand back an arbitrary slice and the nearest
    // ambulance could be the one left out of it — silently, with the list
    // still looking correctly sorted. The $match above has already reduced
    // this to on-duty, crewed, available vehicles; the cap below is a
    // runaway guard, not a shortlist.
    { $limit: 500 },
  ];

  const shortlist = await Ambulance.aggregate(pipeline);
  if (shortlist.length === 0) return [];

  const results: NearbyAmbulance[] = shortlist.map((a: any) => {
    // The assigned driver's own fix first — that is the person who will
    // actually move the vehicle. The position written on the vehicle is a
    // fallback, because any crew member writes it.
    const driverFix = realFix(a.driver?.currentLocation);
    const vehicleFix = realFix(a.currentLocation);
    const fix = driverFix ?? vehicleFix;
    const locationSource: "driver" | "attendant" | "none" = driverFix
      ? "driver"
      : vehicleFix
        ? "attendant"
        : "none";
    const fixAt = driverFix ? a.driver?.lastLocationAt : a.lastLocationAt;
    const hasLoc = !!fix;
    const lat = fix?.lat ?? 0;
    const lng = fix?.lng ?? 0;
    const straightKm = hasLoc
      ? haversineKm(patientLat, patientLng, lat, lng)
      : 0;
    return {
      locationSource,
      locationAgeMin: hasLoc ? minutesSince(fixAt) : null,
      // Upgraded to "road" below for the handful Google is asked about.
      distanceSource: "straight-line" as const,
      ambulanceId: String(a._id),
      providerId: a.provider?._id ? String(a.provider._id) : "",
      providerName: a.provider?.name || "Hospital fleet",
      registrationNumber: a.registrationNumber,
      ambulanceType: a.ambulanceType,
      driverId: String(a.driver._id),
      driverName: a.driver.fullName,
      driverPhone: a.driver.mobileNumber,
      attendantId: a.attendants?.[0]?._id ? String(a.attendants[0]._id) : "",
      attendantName: a.attendants?.[0]?.fullName || "",
      attendants: (a.attendants || []).map((x: any) => ({
        id: String(x._id),
        name: x.fullName || "",
      })),
      // Ambulance position = assigned driver's last reported position.
      ambulanceLocation: { lat: hasLoc ? lat : 0, lng: hasLoc ? lng : 0 },
      straightLineKm: Math.round(straightKm * 100) / 100,
      roadDistanceKm: Math.round(straightKm * 100) / 100,
      etaMinutes: hasLoc ? Math.round((straightKm / 40) * 60) : 0,
    };
  });

  // Apply the radius the caller asked for. The dispatch screen has a radius
  // selector and was sending it all along; it was being dropped here, so
  // every setting returned the same list. A vehicle with NO fix is never cut
  // by the radius — we do not know that it is far away, only that we cannot
  // see it — so it stays on the list, at the bottom.
  const capped =
    maxDistanceKm > 0
      ? results.filter(
          (r) => r.locationSource === "none" || r.straightLineKm <= maxDistanceKm,
        )
      : results;

  // Nearest first; vehicles whose position we don't know sort last, since an
  // unknown distance must never outrank a measured one.
  const byLine = (x: NearbyAmbulance, y: NearbyAmbulance) => {
    const xu = x.locationSource === "none";
    const yu = y.locationSource === "none";
    if (xu !== yu) return xu ? 1 : -1;
    return x.straightLineKm - y.straightLineKm;
  };
  capped.sort(byLine);

  // Straight line has ranked them; now ask Google how far they actually have
  // to DRIVE. It matters: a vehicle 2 km away across a river can be twenty
  // minutes behind one 4 km away on the same road, and the crow-flies figure
  // puts the wrong one at the top of an emergency list.
  //
  // Only the leading few are re-ranked, because the call is billed per
  // vehicle asked about. Straight line is a sound pre-filter — the true
  // road-nearest is reliably somewhere in the crow-flies nearest handful —
  // so paying to road-measure the whole fleet buys nothing.
  const measurable = capped.filter((r) => r.locationSource !== "none");
  const reRankCount = Math.min(
    Math.max(0, config.googleMaps?.roadDistanceLimit ?? 0),
    measurable.length,
  );
  if (reRankCount > 0) {
    const head = measurable.slice(0, reRankCount);
    const legs = await roadLegs(
      { lat: patientLat, lng: patientLng },
      head.map((r) => r.ambulanceLocation),
    );
    head.forEach((r, i) => {
      const leg = legs[i];
      // Null means Google could not route to it (or was unreachable). The
      // straight-line figure already sitting on the row stands.
      if (!leg) return;
      r.roadDistanceKm = leg.km;
      r.etaMinutes = leg.minutes;
      r.distanceSource = "road";
    });
  }

  // Re-sort on whatever each row now holds. A row measured by road and one
  // still on straight line are compared directly: both are the best estimate
  // available for that vehicle, and road distance is never shorter than the
  // crow-flies one, so this cannot promote an unmeasured vehicle unfairly.
  capped.sort((x, y) => {
    const xu = x.locationSource === "none";
    const yu = y.locationSource === "none";
    if (xu !== yu) return xu ? 1 : -1;
    return x.roadDistanceKm - y.roadDistanceKm;
  });
  return capped.slice(0, limit);
};

/**
 * Admin escape hatch: search the fleet by driver/attendant mobile number,
 * computing distance/ETA from the patient if coordinates are supplied.
 * Bypasses radius / duty / staleness filters so the admin can pull up
 * any vehicle they remember by phone (e.g. "give me Vikas's ambulance
 * even if he hasn't pinged in 30 min"). Still excludes on_dispatch and
 * inactive vehicles — those genuinely can't take a new job.
 */
export const searchAmbulancesByMobile = async (
  mobile: string,
  patientLat?: number,
  patientLng?: number,
): Promise<NearbyAmbulance[]> => {
  // Match on either crew member's mobile, partial OK so "9800" pulls
  // the whole provider's fleet — admin is in a hurry, exact match is
  // a poor UX.
  const escaped = mobile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped);
  const staff = await AmbulanceStaff.find({
    mobileNumber: { $regex: regex },
    isDeleted: false,
  })
    .select("_id")
    .lean();
  if (staff.length === 0) return [];
  const staffIds = staff.map((s: any) => s._id);

  const pipeline: any[] = [
    {
      $match: {
        isActive: true,
        status: { $ne: "on_dispatch" }, // exclude occupied
        $or: [
          { assignedDriverId: { $in: staffIds } },
          { assignedAttendantIds: { $in: staffIds } },
          { assignedAttendantId: { $in: staffIds } },
        ],
      },
    },
    {
      $lookup: {
        from: "ambulancestaffs",
        localField: "assignedDriverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "ambulancestaffs",
        let: {
          ids: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$assignedAttendantIds", []] } }, 0] },
              "$assignedAttendantIds",
              { $cond: [{ $ifNull: ["$assignedAttendantId", false] }, ["$assignedAttendantId"], []] },
            ],
          },
        },
        pipeline: [{ $match: { $expr: { $in: ["$_id", "$$ids"] } } }],
        as: "attendants",
      },
    },
    {
      $lookup: {
        from: "ambulanceserviceproviders",
        localField: "providerId",
        foreignField: "_id",
        as: "provider",
      },
    },
    { $unwind: { path: "$provider", preserveNullAndEmptyArrays: true } },
    { $limit: 25 },
  ];

  const rows = await Ambulance.aggregate(pipeline);
  if (rows.length === 0) return [];

  // Distance is only meaningful if both endpoints are known. Search
  // results without a patient location just show 0 / 0 for distance;
  // the UI handles that gracefully.
  const havePatient =
    typeof patientLat === "number" && typeof patientLng === "number";
  return rows.map((a: any) => {
    // Same preference as the ranked list: the assigned driver's own fix,
    // then whatever the vehicle last recorded.
    const driverFix = realFix(a.driver?.currentLocation);
    const vehicleFix = realFix(a.currentLocation);
    const fix = driverFix ?? vehicleFix;
    const lat = fix?.lat;
    const lng = fix?.lng;
    let straightKm = 0;
    if (havePatient && lat != null && lng != null) {
      straightKm = haversineKm(patientLat!, patientLng!, lat, lng);
    }
    return {
      locationSource: (driverFix
        ? "driver"
        : vehicleFix
          ? "attendant"
          : "none") as "driver" | "attendant" | "none",
      locationAgeMin: fix
        ? minutesSince(driverFix ? a.driver?.lastLocationAt : a.lastLocationAt)
        : null,
      distanceSource: "straight-line" as const,
      ambulanceId: String(a._id),
      providerId: String(a.provider?._id || ""),
      providerName: a.provider?.name || "",
      registrationNumber: a.registrationNumber,
      ambulanceType: a.ambulanceType,
      driverId: String(a.driver?._id || ""),
      driverName: a.driver?.fullName || "(unassigned)",
      driverPhone: a.driver?.mobileNumber || "",
      attendantId: String(a.attendants?.[0]?._id || ""),
      attendantName: a.attendants?.[0]?.fullName || "(unassigned)",
      attendants: (a.attendants || []).map((x: any) => ({
        id: String(x._id),
        name: x.fullName || "",
      })),
      ambulanceLocation: {
        lat: lat ?? 0,
        lng: lng ?? 0,
      },
      straightLineKm: Math.round(straightKm * 100) / 100,
      roadDistanceKm: Math.round(straightKm * 100) / 100,
      etaMinutes: Math.round((straightKm / 40) * 60),
    } as NearbyAmbulance;
  });
};

// Cheap straight-line distance — search results don't need Distance
// Matrix precision and we want to avoid hitting Google for every
// admin search keystroke.
const haversineKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/**
 * Create EmergencyDispatch atomically, reserve the ambulance, mark SOS responded.
 */
export const createDispatch = async (params: {
  sosId: Types.ObjectId;
  ambulanceId: Types.ObjectId;
  adminId: Types.ObjectId;
  roadDistanceKm: number;
  etaMinutes: number;
  patientLat: number;
  patientLng: number;
}) => {
  // Try transactional path first (replica set / mongos). On standalone Mongo,
  // transactions throw — fall back to a non-transactional sequence which is
  // still safe because the initial findOneAndUpdate atomically reserves the
  // ambulance via its status filter.
  const runWithoutTxn = async (): Promise<Types.ObjectId> => {
    const ambulance = await Ambulance.findOneAndUpdate(
      {
        _id: params.ambulanceId,
        status: "available",
        isActive: true,
        currentDispatchId: null,
      },
      { status: "on_dispatch" },
      { returnDocument: "after" },
    );
    if (!ambulance) throw new Error("ambulance_not_available");

    const driverDoc = ambulance.assignedDriverId
      ? await AmbulanceStaff.findById(ambulance.assignedDriverId)
          .select("mobileNumber")
          .lean()
      : null;
    // Any attendant's number will do as the fallback contact — it is only
    // used when the driver has none on file.
    const attendantIds = attendantIdsOf(ambulance);
    const attendantDoc = attendantIds.length
      ? await AmbulanceStaff.findOne({
          _id: { $in: attendantIds },
          mobileNumber: { $nin: [null, ""] },
        })
          .select("mobileNumber")
          .lean()
      : null;
    const contactPhone =
      driverDoc?.mobileNumber || attendantDoc?.mobileNumber || "N/A";

    try {
      const dispatch: any = await (EmergencyDispatch as any).create({
        sosSubmission: params.sosId,
        dispatchType: "AMBULANCE",
        serviceName: ambulance.registrationNumber,
        servicePhone: contactPhone,
        dispatchedBy: params.adminId,
        dispatchedAt: new Date(),
        priority: "HIGH",
        status: "DISPATCHED",
        ambulanceId: ambulance._id,
        driverStaffId: ambulance.assignedDriverId,
        attendantStaffIds: attendantIdsOf(ambulance),
        patientLocation: {
          type: "Point",
          coordinates: [params.patientLng, params.patientLat],
        },
        roadDistanceKm: params.roadDistanceKm,
        etaMinutes: params.etaMinutes,
        otp: mintOtp(),
      });

      await Ambulance.updateOne(
        { _id: ambulance._id },
        { currentDispatchId: dispatch._id },
      );
      await SOSAlert.updateOne(
        { _id: params.sosId },
        {
          status: "RESPONDED",
          respondedBy: params.adminId,
          respondedAt: new Date(),
        },
      );
      return dispatch._id as Types.ObjectId;
    } catch (e) {
      // Roll back the ambulance reservation on failure
      await Ambulance.updateOne(
        { _id: params.ambulanceId },
        { status: "available", currentDispatchId: null },
      );
      throw e;
    }
  };

  let dispatchId: Types.ObjectId | null = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ambulance = await Ambulance.findOneAndUpdate(
        {
          _id: params.ambulanceId,
          status: "available",
          isActive: true,
          currentDispatchId: null,
        },
        { status: "on_dispatch" },
        { session, returnDocument: "after" },
      );
      if (!ambulance) throw new Error("ambulance_not_available");

      // Pull a contact phone for the dispatch row — the EmergencyDispatch
      // schema requires it. Prefer the driver's mobile (they're the one
      // ops calls); fall back to attendant; "N/A" if neither has a
      // number on file. The dispatch FCM itself uses the staff's
      // fcmToken so this field is purely for the dashboard contact row.
      const driverDoc = ambulance.assignedDriverId
        ? await AmbulanceStaff.findById(ambulance.assignedDriverId)
            .select("mobileNumber")
            .session(session)
            .lean()
        : null;
      const attendantIds = attendantIdsOf(ambulance);
      const attendantDoc = attendantIds.length
        ? await AmbulanceStaff.findOne({
            _id: { $in: attendantIds },
            mobileNumber: { $nin: [null, ""] },
          })
            .select("mobileNumber")
            .session(session)
            .lean()
        : null;
      const contactPhone =
        driverDoc?.mobileNumber || attendantDoc?.mobileNumber || "N/A";

      const vehicleType = await resolveVehicleTypeForAmbulance(ambulance.ambulanceType).catch(
        () => null,
      );

      const dispatch = await EmergencyDispatch.create(
        [
          {
            sosSubmission: params.sosId,
            dispatchType: "AMBULANCE",
            serviceName: ambulance.registrationNumber,
            servicePhone: contactPhone,
            dispatchedBy: params.adminId,
            dispatchedAt: new Date(),
            priority: "HIGH",
            status: "DISPATCHED",
            ambulanceId: ambulance._id,
            driverStaffId: ambulance.assignedDriverId,
            attendantStaffIds: attendantIdsOf(ambulance),
            patientLocation: {
              type: "Point",
              coordinates: [params.patientLng, params.patientLat],
            },
            roadDistanceKm: params.roadDistanceKm,
            etaMinutes: params.etaMinutes,
            vehicleTypeId: vehicleType?._id,
            otp: mintOtp(),
          },
        ] as any,
        { session },
      );
      dispatchId = (dispatch as any)[0]._id as Types.ObjectId;

      await Ambulance.updateOne(
        { _id: ambulance._id },
        { currentDispatchId: dispatchId },
        { session },
      );

      await SOSAlert.updateOne(
        { _id: params.sosId },
        {
          status: "RESPONDED",
          respondedBy: params.adminId,
          respondedAt: new Date(),
        },
        { session },
      );
    });
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (
      msg.includes("Transaction numbers are only allowed on a replica set") ||
      msg.includes("transactions are not supported") ||
      msg.includes("does not support retryable writes") ||
      err?.codeName === "IllegalOperation"
    ) {
      // Standalone MongoDB — fall back without transactions
      dispatchId = await runWithoutTxn();
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  // Link the SOS patient and denormalise their name + pickup address for the
  // driver display — in ONE place so every dispatch path (admin SOS
  // dashboard, sos-alerts, etc.) behaves identically: the patient app flips
  // to live tracking.
  const { patientUserId, patientName, patientPhone, pickupAddress } =
    await resolveSosPatient(params.sosId);
  await EmergencyDispatch.updateOne(
    { _id: dispatchId },
    {
      patientUserId: patientUserId || undefined,
      patientName: patientName || undefined,
      patientPhone: patientPhone || undefined,
      pickupAddress: pickupAddress || undefined,
    },
  );

  return await EmergencyDispatch.findById(dispatchId!).lean();
};

export const transitionDispatch = async (
  dispatchId: Types.ObjectId,
  driverStaffId: Types.ObjectId,
  toStatus: "ACKNOWLEDGED" | "EN_ROUTE" | "ON_SCENE" | "ON_TRIP" | "COMPLETED",
  opts?: { otp?: string },
) => {
  const dispatch = await EmergencyDispatch.findById(dispatchId);
  if (!dispatch) throw new Error("dispatch_not_found");
  if (String(dispatch.driverStaffId) !== String(driverStaffId)) {
    throw new Error("forbidden");
  }

  const allowedPrev: Record<string, string[]> = {
    ACKNOWLEDGED: ["DISPATCHED"],
    EN_ROUTE: ["ACKNOWLEDGED"],
    ON_SCENE: ["EN_ROUTE"],
    ON_TRIP: ["ON_SCENE"],
    COMPLETED: ["ON_SCENE", "ON_TRIP"],
  };
  if (!allowedPrev[toStatus].includes(dispatch.status)) {
    throw new Error("invalid_status_transition");
  }

  // Starting the trip (patient pickup) requires the OTP shown to the patient.
  if (toStatus === "ON_TRIP" && dispatch.otp) {
    if (!opts?.otp || String(opts.otp) !== String(dispatch.otp)) {
      throw new Error("invalid_otp");
    }
  }

  dispatch.status = toStatus;
  if (toStatus === "ACKNOWLEDGED") {
    dispatch.acknowledgedAt = new Date();
    dispatch.acceptedAt = new Date();
  }
  if (toStatus === "ON_SCENE") dispatch.arrivedAt = new Date();
  if (toStatus === "COMPLETED") {
    dispatch.completedAt = new Date();

    // Real fare for the actual route driven (dispatch point → pickup →
    // hospital), mirroring AmbulanceRequest#complete() — replaces the flat
    // placeholder estimate shown while the trip was in progress. Silently
    // skipped (not blocking trip completion) if the vehicle type never
    // resolved or no distance was tracked.
    if (dispatch.vehicleTypeId && dispatch.actualDistanceKm) {
      const actualDurationMin = dispatch.tripStartedTrackingAt
        ? Math.max(
            1,
            Math.round(
              (dispatch.completedAt.getTime() - dispatch.tripStartedTrackingAt.getTime()) / 60000,
            ),
          )
        : 0;
      try {
        const actualFare = await calculateFare({
          vehicleTypeId: dispatch.vehicleTypeId as any,
          distanceKm: dispatch.actualDistanceKm,
          durationMin: actualDurationMin,
        });
        dispatch.actualDurationMin = actualDurationMin;
        dispatch.actualFareAmount = actualFare.finalFare;
        dispatch.actualFareBreakdown = actualFare as any;
      } catch {
        // Vehicle type/fare config missing — don't block trip completion.
      }
    }
  }
  await dispatch.save();

  if (toStatus === "COMPLETED" && dispatch.ambulanceId) {
    await Ambulance.updateOne(
      { _id: dispatch.ambulanceId },
      { status: "available", currentDispatchId: null },
    );
    await SOSAlert.updateOne(
      { _id: dispatch.sosSubmission },
      { status: "RESOLVED", resolvedAt: new Date() },
    );
  }

  return dispatch;
};
