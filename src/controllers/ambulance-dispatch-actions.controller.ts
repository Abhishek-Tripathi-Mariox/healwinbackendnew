import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import {
  transitionDispatch,
} from "../services/ambulance-dispatch.service";
import { emitToUser, emitToSosSubmission } from "../utils/socket.util";
import { sendToUser } from "../services/notification.service";
import { attendantIdsOf, crewIdsOf } from "../utils/crew.util";
import { cancelDispatch } from "../services/dispatch-cancel.service";

const asId = (v: string) => new Types.ObjectId(v);

// Patient-facing push copy per dispatch status.
const PATIENT_PUSH: Record<string, { title: string; body: string }> = {
  ACKNOWLEDGED: { title: "Crew on the way", body: "Your ambulance crew is preparing to move." },
  EN_ROUTE: { title: "Ambulance en route", body: "Your ambulance is on the way. Track it live." },
  ON_SCENE: { title: "Ambulance arrived", body: "Your ambulance has reached the pickup point." },
  ON_TRIP: { title: "Trip started", body: "You are on the way to the hospital." },
  COMPLETED: { title: "Trip completed", body: "Your ambulance trip is complete. Get well soon." },
};

const errCodeMap: Record<string, number> = {
  forbidden: 403,
  dispatch_not_found: 404,
  invalid_status_transition: 409,
  dispatch_not_rejectable: 409,
  invalid_otp: 400,
};

// Notify both the admin (who dispatched) and the SOS patient of a status change.
const notifyParties = (d: any) => {
  if (d?.dispatchedBy) {
    emitToUser(String(d.dispatchedBy), "dispatch:status", {
      dispatchId: String(d._id),
      status: d.status,
    });
  }
  if (d?.patientUserId) {
    emitToUser(String(d.patientUserId), "booking:status", {
      dispatchId: String(d._id),
      status: d.status,
    });
    // FCM push so the patient is told (esp. "ambulance arrived") even when the
    // app is backgrounded.
    const copy = PATIENT_PUSH[d.status];
    if (copy) {
      void sendToUser(d.patientUserId, "BOOKING", copy.title, copy.body, {
        route: "Tracking",
        dispatchId: String(d._id),
        screen: "Tracking",
      }).catch(() => undefined);
    }
  }
  // Public website caller watching this SOS submission (anonymous, no user id).
  if (d?.sosSubmission) {
    emitToSosSubmission(String(d.sosSubmission), d.status, {
      dispatchId: String(d._id),
      etaMinutes: d.etaMinutes,
    });
  }
  // Notify BOTH crew on the dispatch (driver + attendant) so the partner's app
  // updates too — e.g. when the driver completes, the attendant's Active
  // Dispatch screen advances/clears instead of staying stuck. On a terminal
  // status, send `dispatch:resolved` so their screen clears the active card.
  const resolved = d?.status === "COMPLETED" || d?.status === "CANCELLED";
  for (const crewId of crewIdsOf(d)) {
    emitToUser(crewId, "dispatch:status", {
      dispatchId: String(d._id),
      status: d.status,
    });
    if (resolved) {
      emitToUser(crewId, "dispatch:resolved", { dispatchId: String(d._id) });
    }
  }
};

export const accept = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  try {
    const d = await transitionDispatch(
      asId((req.params.id as string)),
      asId(staffId),
      "ACKNOWLEDGED",
    );
    notifyParties(d);
    req.rData = { dispatch: d };
    req.msg = "accepted";
    next();
  } catch (e: any) {
    return res
      .status(errCodeMap[e.message] || 500)
      .json({ rCode: 0, rMsg: e.message, rData: {} });
  }
};

/**
 * The crew cannot take this run.
 *
 * Allowed right up to ON_SCENE, not only while the dispatch is still
 * ringing. A vehicle breaks down on the way, a tyre goes, the road is shut —
 * and until now the driver's only option after accepting was to telephone
 * the control room, with the dispatch still showing as live on the board and
 * the ambulance still marked busy.
 *
 * `reasonCode` comes from a fixed list so ops can count breakdowns later;
 * `note` is whatever the driver adds. The SOS goes straight back into the
 * actionable queue and the board is told another ambulance is needed.
 */
export const reject = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const body = req.body || {};
  const reasonCode = String(body.reasonCode || body.reason || "").trim() || undefined;
  const note = String(body.note || "").trim();

  const existing: any = await EmergencyDispatch.findById((req.params.id as string));
  if (!existing) {
    return res
      .status(404)
      .json({ rCode: 0, rMsg: "dispatch_not_found", rData: {} });
  }
  // Any crew member aboard may stand the run down, not just the driver — an
  // attendant taken ill is as real a reason as a breakdown.
  if (!crewIdsOf(existing).includes(String(staffId))) {
    return res
      .status(403)
      .json({ rCode: 0, rMsg: "forbidden", rData: {} });
  }

  const result = await cancelDispatch({
    dispatch: existing,
    by: "crew",
    reasonCode,
    note,
    // Someone still needs an ambulance — put the emergency back in the queue.
    reopenSos: true,
    actorId: staffId,
  });
  if (!result.ok) {
    return res.status(409).json({ rCode: 0, rMsg: result.reason, rData: {} });
  }

  req.rData = { dispatch: result.dispatch };
  req.msg = "rejected";
  return next();
};

const makeTransition =
  (to: "EN_ROUTE" | "ON_SCENE" | "COMPLETED") =>
  async (req: Request, res: Response, next: NextFunction) => {
    const staffId = (req as any).staffId;
    try {
      const d = await transitionDispatch(
        asId((req.params.id as string)),
        asId(staffId),
        to,
      );
      notifyParties(d);
      req.rData = { dispatch: d };
      req.msg = `status_${to.toLowerCase()}`;
      next();
    } catch (e: any) {
      return res
        .status(errCodeMap[e.message] || 500)
        .json({ rCode: 0, rMsg: e.message, rData: {} });
    }
  };

export const enRoute = makeTransition("EN_ROUTE");
export const onScene = makeTransition("ON_SCENE");
export const complete = makeTransition("COMPLETED");

/** Start the trip after verifying the patient's pickup OTP → ON_TRIP. */
export const startTrip = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const { otp } = req.body || {};
  try {
    const d = await transitionDispatch(
      asId((req.params.id as string)),
      asId(staffId),
      "ON_TRIP",
      { otp },
    );
    notifyParties(d);
    req.rData = { dispatch: d };
    req.msg = "status_on_trip";
    next();
  } catch (e: any) {
    return res
      .status(errCodeMap[e.message] || 500)
      .json({ rCode: 0, rMsg: e.message, rData: {} });
  }
};

/** Crew sets the drop-off hospital (destination) on the dispatch. */
export const setDestination = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const b = req.body || {};
  const d: any = await EmergencyDispatch.findById((req.params.id as string));
  if (!d) {
    return res.status(404).json({ rCode: 0, rMsg: "dispatch_not_found", rData: {} });
  }
  if (String(d.driverStaffId) !== String(staffId)) {
    return res.status(403).json({ rCode: 0, rMsg: "forbidden", rData: {} });
  }
  d.serviceName = b.name || b.address || d.serviceName;
  if (b.address) d.serviceAddress = b.address;
  if (b.lat != null && b.lng != null) {
    d.serviceLocation = { type: "Point", coordinates: [Number(b.lng), Number(b.lat)] };
  }
  await d.save();
  if (d.patientUserId) {
    emitToUser(String(d.patientUserId), "booking:status", {
      dispatchId: String(d._id),
      status: d.status,
      drop: { address: d.serviceName },
    });
  }
  req.rData = { dispatch: d };
  req.msg = "success";
  next();
};
