import { Types } from "mongoose";

import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import { SOSSubmission } from "../models/sos-submission.model";
import { SOSAlert } from "../models/sos.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import { sendDispatchPush, sendToUser } from "../services/notification.service";
import { emitToUser } from "../utils/socket.util";
import { crewIdsOf } from "../utils/crew.util";
import { emitToPermission } from "../utils/socket.util";
import { PERMISSIONS } from "../models/role.model";

/**
 * Calling off an SOS dispatch.
 *
 * Three people can do it — the patient who no longer needs it, the crew whose
 * vehicle has broken down, and the control room — and each used to do it
 * differently. One path forgot to free the ambulance, another left the crew's
 * app showing a job that no longer existed, and none of them told the dispatch
 * board, which only noticed on its next poll.
 *
 * Everything goes through here now, so a cancellation always means the same
 * five things: the dispatch is closed, the vehicle is released, the SOS goes
 * back to wherever it belongs, everyone aboard is told, and the board lights
 * up.
 */

/** Who called it off. Decides what the SOS does next and what people are told. */
export type CancelledBy = "patient" | "crew" | "admin";

/** Statuses a dispatch can still be called off from. */
export const CANCELLABLE = [
  "DISPATCHED",
  "ACKNOWLEDGED",
  "EN_ROUTE",
  "ON_SCENE",
] as const;

/**
 * ON_TRIP is deliberately absent: the patient is in the vehicle by then.
 * "Cancelling" a journey already under way is not a dispatch decision — it
 * ends at a hospital or it is handled by the control room on the phone.
 */
export const isCancellable = (status?: string): boolean =>
  !!status && (CANCELLABLE as readonly string[]).includes(status);

/** Why the crew could not take it. Fixed list so ops can count them later. */
export const CREW_CANCEL_REASONS: Record<string, string> = {
  vehicle_breakdown: "Vehicle breakdown",
  out_of_fuel: "Out of fuel",
  too_far: "Too far to reach in time",
  traffic_blocked: "Blocked by traffic",
  wrong_assignment: "Wrong assignment",
  crew_unavailable: "Crew unavailable",
  medical_emergency: "Crew medical emergency",
  other: "Other",
};

export const crewReasonLabel = (code?: string): string =>
  (code && CREW_CANCEL_REASONS[code]) || "Crew could not take the call";

export interface CancelResult {
  ok: boolean;
  /** Set when it could not be cancelled, phrased for the person who tried. */
  reason?: string;
  dispatch?: any;
}

/** Tell everyone aboard their job is off, by socket and by push. */
const notifyCrew = async (dispatch: any, message: string) => {
  const crew = crewIdsOf(dispatch);
  if (crew.length === 0) return;
  for (const staffId of crew) {
    emitToUser(staffId, "dispatch:cancelled", {
      dispatchId: String(dispatch._id),
      sosId: dispatch.sosSubmission ? String(dispatch.sosSubmission) : undefined,
    });
  }
  const staff: any[] = await AmbulanceStaff.find({ _id: { $in: crew } })
    .select("fcmToken")
    .lean()
    .catch(() => []);
  for (const member of staff) {
    if (!member?.fcmToken) continue;
    // The dispatch channel, not the ordinary one: the crew may be driving and
    // a quiet notification is one they will not see until they arrive.
    sendDispatchPush(member.fcmToken, "Dispatch cancelled", message, {
      action: "dispatch_cancelled",
      dispatchId: String(dispatch._id),
    }).catch((e) => console.error("[dispatch-cancel] crew push failed:", e?.message || e));
  }
};

/** Tell the patient, unless they are the one who cancelled. */
const notifyPatient = async (dispatch: any, title: string, message: string) => {
  if (!dispatch?.patientUserId) return;
  emitToUser(String(dispatch.patientUserId), "booking:cancelled", {
    dispatchId: String(dispatch._id),
  });
  await sendToUser(dispatch.patientUserId, "BOOKING", title, message, {
    route: "Tracking",
    screen: "Tracking",
  }).catch(() => undefined);
};

/**
 * Call off a dispatch.
 *
 * `reopenSos` decides what happens to the emergency itself. A crew that
 * cannot go still leaves someone who needs an ambulance, so the SOS returns
 * to the control room's actionable queue and the board is told to send
 * another. A patient who no longer needs help closes the SOS outright.
 */
export const cancelDispatch = async (params: {
  dispatch: any;
  by: CancelledBy;
  /** Machine-readable, e.g. `vehicle_breakdown`. Stored on the dispatch. */
  reasonCode?: string;
  /** Free text the canceller typed. */
  note?: string;
  /** True → the SOS goes back in the queue for another ambulance. */
  reopenSos: boolean;
  actorId?: Types.ObjectId | string;
}): Promise<CancelResult> => {
  const { dispatch, by, reasonCode, note, reopenSos } = params;

  if (!isCancellable(dispatch?.status)) {
    return {
      ok: false,
      reason:
        dispatch?.status === "ON_TRIP"
          ? "The trip has already started — call the control room instead."
          : `This dispatch is ${String(dispatch?.status || "closed").toLowerCase()} and can no longer be cancelled.`,
    };
  }

  const label =
    by === "crew"
      ? crewReasonLabel(reasonCode)
      : by === "patient"
        ? "Cancelled by patient"
        : "Cancelled by control room";

  dispatch.status = "CANCELLED";
  dispatch.cancelledAt = new Date();
  dispatch.cancelReason = [label, note?.trim()].filter(Boolean).join(" — ");
  await dispatch.save();

  // Release the vehicle so it (and its crew) can take another run.
  if (dispatch.ambulanceId) {
    await Ambulance.updateOne(
      { _id: dispatch.ambulanceId },
      { status: "available", currentDispatchId: null },
    ).catch(() => undefined);
  }

  const sosId = dispatch.sosSubmission;
  if (sosId) {
    if (reopenSos) {
      // Back to exactly the state createDispatch advanced it from, so it
      // reappears in the queue. The driver-reject path used to revert only
      // the legacy SOSAlert, leaving the submission stuck IN_PROGRESS and
      // out of the control room's actionable list.
      await SOSAlert.updateOne({ _id: sosId, status: "RESPONDED" }, { status: "ACTIVE" }).catch(
        () => undefined,
      );
      await SOSSubmission.updateOne(
        { _id: sosId, status: "IN_PROGRESS" },
        { status: "PENDING" },
      ).catch(() => undefined);
    } else {
      await SOSAlert.updateOne(
        { _id: sosId, status: { $in: ["ACTIVE", "RESPONDED"] } },
        { status: "FALSE_ALARM", resolvedAt: new Date(), resolutionNotes: dispatch.cancelReason },
      ).catch(() => undefined);
      await SOSSubmission.updateOne(
        { _id: sosId, status: { $in: ["PENDING", "IN_PROGRESS"] } },
        { status: "CLOSED" },
      ).catch(() => undefined);
    }
    // Mark the vehicle as one this SOS should not be offered again, so a
    // re-dispatch does not hand it straight back to the crew that declined.
    if (by === "crew" && dispatch.ambulanceId) {
      await SOSAlert.updateOne(
        { _id: sosId },
        { $addToSet: { rejectedAmbulanceIds: dispatch.ambulanceId } },
      ).catch(() => undefined);
    }
  }

  // --- tell everyone ------------------------------------------------------
  // The crew always needs to know, including whoever cancelled — their own
  // app has to drop the active card.
  await notifyCrew(
    dispatch,
    by === "patient"
      ? "The patient cancelled this request."
      : by === "admin"
        ? "This dispatch was cancelled by the control room."
        : dispatch.cancelReason || "This dispatch was cancelled.",
  );

  if (by !== "patient") {
    await notifyPatient(
      dispatch,
      reopenSos ? "Finding you another ambulance" : "Dispatch cancelled",
      reopenSos
        ? "The assigned ambulance could not come. We are sending another one."
        : "Your ambulance dispatch was cancelled. Please request again if you still need help.",
    );
  }

  // The board, not just whichever admin happened to press dispatch. Without
  // this the control room learned about a declined run only on its next poll.
  emitToPermission(PERMISSIONS.SOS_VIEW, "sos:dispatch-cancelled", {
    sosId: sosId ? String(sosId) : undefined,
    dispatchId: String(dispatch._id),
    ambulanceId: dispatch.ambulanceId ? String(dispatch.ambulanceId) : undefined,
    by,
    reason: dispatch.cancelReason,
    /** True means: this emergency still needs an ambulance. */
    needsReassign: reopenSos,
  });

  return { ok: true, dispatch };
};

export default { cancelDispatch, isCancellable, CANCELLABLE, CREW_CANCEL_REASONS, crewReasonLabel };
