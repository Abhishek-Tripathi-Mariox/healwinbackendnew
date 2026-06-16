import mongoose, { Types } from "mongoose";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import { SOSAlert } from "../models/sos.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";

export interface NearbyAmbulance {
  ambulanceId: string;
  providerId: string;
  providerName: string;
  registrationNumber: string;
  ambulanceType: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  attendantId: string;
  attendantName: string;
  ambulanceLocation: { lat: number; lng: number };
  straightLineKm: number;
  roadDistanceKm: number;
  etaMinutes: number;
}

/**
 * Two-stage lookup: $geoNear shortlist then Distance Matrix re-rank.
 *
 * `maxDistanceKm` caps the straight-line search radius — anything farther
 * than this is never considered, even if it's the only available vehicle.
 * Default 10km matches the patient SLA: a dispatch farther than that
 * isn't useful anyway (>20 min ETA in a city). Pass a larger number for
 * rural ops or 0 to disable the cap.
 */
export const getNearbyAmbulances = async (
  patientLat: number,
  patientLng: number,
  excludeAmbulanceIds: Types.ObjectId[] = [],
  limit = 10,
  // Kept for API compatibility; ignored in GPS-optional mode (see below).
  _maxDistanceKm = 10,
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
        assignedDriverId: { $ne: null },
        assignedAttendantId: { $ne: null },
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
      $lookup: {
        from: "ambulancestaffs",
        localField: "assignedAttendantId",
        foreignField: "_id",
        as: "attendant",
      },
    },
    { $unwind: "$attendant" },
    {
      $match: {
        "driver.isActive": true,
        "driver.isDeleted": false,
        "attendant.isActive": true,
        "attendant.isDeleted": false,
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
    { $unwind: "$provider" },
    { $limit: limit * 3 },
  ];

  const shortlist = await Ambulance.aggregate(pipeline);
  if (shortlist.length === 0) return [];

  const results: NearbyAmbulance[] = shortlist.map((a: any) => {
    const lat = a.currentLocation?.coordinates?.[1];
    const lng = a.currentLocation?.coordinates?.[0];
    // A vehicle that has never pinged real GPS has currentLocation [0,0] — that
    // is NOT a real position, so don't compute distance against it (it produced
    // nonsense like "8778 km" from the null-island origin). Treat as unknown.
    const hasLoc =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      (lat !== 0 || lng !== 0) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180;
    const straightKm = hasLoc
      ? haversineKm(patientLat, patientLng, lat, lng)
      : 0;
    return {
      ambulanceId: String(a._id),
      providerId: String(a.provider._id),
      providerName: a.provider.name,
      registrationNumber: a.registrationNumber,
      ambulanceType: a.ambulanceType,
      driverId: String(a.driver._id),
      driverName: a.driver.fullName,
      driverPhone: a.driver.mobileNumber,
      attendantId: String(a.attendant._id),
      attendantName: a.attendant.fullName,
      // Ambulance position = assigned driver's last reported position.
      ambulanceLocation: { lat: hasLoc ? lat : 0, lng: hasLoc ? lng : 0 },
      straightLineKm: Math.round(straightKm * 100) / 100,
      roadDistanceKm: Math.round(straightKm * 100) / 100,
      etaMinutes: hasLoc ? Math.round((straightKm / 40) * 60) : 0,
    };
  });

  // Known-distance vehicles first (nearest first); unknown-location ones last.
  results.sort((a, b) => {
    const au = a.roadDistanceKm === 0;
    const bu = b.roadDistanceKm === 0;
    if (au && !bu) return 1;
    if (bu && !au) return -1;
    return a.roadDistanceKm - b.roadDistanceKm;
  });
  return results.slice(0, limit);
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
        localField: "assignedAttendantId",
        foreignField: "_id",
        as: "attendant",
      },
    },
    { $unwind: { path: "$attendant", preserveNullAndEmptyArrays: true } },
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
    const lat = a.currentLocation?.coordinates?.[1];
    const lng = a.currentLocation?.coordinates?.[0];
    let straightKm = 0;
    if (havePatient && lat != null && lng != null) {
      straightKm = haversineKm(patientLat!, patientLng!, lat, lng);
    }
    return {
      ambulanceId: String(a._id),
      providerId: String(a.provider?._id || ""),
      providerName: a.provider?.name || "",
      registrationNumber: a.registrationNumber,
      ambulanceType: a.ambulanceType,
      driverId: String(a.driver?._id || ""),
      driverName: a.driver?.fullName || "(unassigned)",
      driverPhone: a.driver?.mobileNumber || "",
      attendantId: String(a.attendant?._id || ""),
      attendantName: a.attendant?.fullName || "(unassigned)",
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
    const attendantDoc = ambulance.assignedAttendantId
      ? await AmbulanceStaff.findById(ambulance.assignedAttendantId)
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
        attendantStaffId: ambulance.assignedAttendantId,
        patientLocation: {
          type: "Point",
          coordinates: [params.patientLng, params.patientLat],
        },
        roadDistanceKm: params.roadDistanceKm,
        etaMinutes: params.etaMinutes,
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
      const attendantDoc = ambulance.assignedAttendantId
        ? await AmbulanceStaff.findById(ambulance.assignedAttendantId)
            .select("mobileNumber")
            .session(session)
            .lean()
        : null;
      const contactPhone =
        driverDoc?.mobileNumber || attendantDoc?.mobileNumber || "N/A";

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
            attendantStaffId: ambulance.assignedAttendantId,
            patientLocation: {
              type: "Point",
              coordinates: [params.patientLng, params.patientLat],
            },
            roadDistanceKm: params.roadDistanceKm,
            etaMinutes: params.etaMinutes,
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

  return await EmergencyDispatch.findById(dispatchId!).lean();
};

export const rejectDispatch = async (
  dispatchId: Types.ObjectId,
  reason?: string,
) => {
  const dispatch = await EmergencyDispatch.findById(dispatchId);
  if (!dispatch) throw new Error("dispatch_not_found");
  if (!["DISPATCHED"].includes(dispatch.status)) {
    throw new Error("dispatch_not_rejectable");
  }

  dispatch.status = "CANCELLED";
  dispatch.cancelledAt = new Date();
  dispatch.cancelReason = reason || "driver_rejected";
  await dispatch.save();

  if (dispatch.ambulanceId) {
    await Ambulance.updateOne(
      { _id: dispatch.ambulanceId },
      { status: "available", currentDispatchId: null },
    );
    await SOSAlert.updateOne(
      { _id: dispatch.sosSubmission },
      {
        $addToSet: { rejectedAmbulanceIds: dispatch.ambulanceId },
        status: "ACTIVE",
      },
    );
  }

  return dispatch;
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
  if (toStatus === "COMPLETED") dispatch.completedAt = new Date();
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
