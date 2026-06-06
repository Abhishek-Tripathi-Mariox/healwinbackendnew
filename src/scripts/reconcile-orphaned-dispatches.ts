/**
 * One-shot backfill: every SOSSubmission already RESOLVED or CLOSED
 * but with a still-open EmergencyDispatch gets reconciled — the
 * dispatch is marked COMPLETED, the ambulance is freed back to
 * "available", and the driver/attendant get a "dispatch_resolved"
 * FCM so their app exits the active-dispatch screen.
 *
 * Needed once after deploying the cascade-resolve handler, because
 * resolves done before that deploy never ran the cascade.
 *
 * Run: cd backend && npx ts-node src/scripts/reconcile-orphaned-dispatches.ts
 *
 * Safe to re-run — idempotent. Skips dispatches already COMPLETED or
 * CANCELLED.
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import { SOSSubmission } from "../models/sos-submission.model";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import Ambulance from "../models/ambulance.model";
import AmbulanceStaff from "../models/ambulance-staff.model";
import {
  initializeFirebase,
  sendPushNotification,
} from "../services/notification.service";

const run = async () => {
  await mongoose.connect(config.database.url);
  // FCM needs to be initialized to fire the "dispatch_resolved" push.
  // Best-effort: if Firebase creds aren't on disk in this env, the
  // reconcile still flips DB state, just without the push.
  await initializeFirebase();

  const resolvedIds = await SOSSubmission.find({
    status: { $in: ["RESOLVED", "CLOSED"] },
  })
    .select("_id status")
    .lean();
  console.log(`\nFound ${resolvedIds.length} RESOLVED/CLOSED submissions.\n`);

  let fixed = 0;
  for (const sub of resolvedIds as any[]) {
    const dispatch = await EmergencyDispatch.findOne({
      sosSubmission: sub._id,
      dispatchType: "AMBULANCE",
      status: { $nin: ["COMPLETED", "CANCELLED"] },
    });
    if (!dispatch) continue;

    dispatch.status = "COMPLETED";
    dispatch.completedAt = new Date();
    dispatch.responseNotes =
      `Auto-reconciled: SOS was ${sub.status} but dispatch was still open`.slice(
        0,
        500,
      );
    await dispatch.save();

    if (dispatch.ambulanceId) {
      await Ambulance.updateOne(
        { _id: dispatch.ambulanceId },
        { status: "available", currentDispatchId: null },
      );
    }

    // Notify the crew so any lingering active-dispatch screen pops.
    const data = {
      action: "dispatch_resolved",
      dispatchId: String(dispatch._id),
      sosId: String(sub._id),
    };
    const [driver, attendant] = await Promise.all([
      dispatch.driverStaffId
        ? AmbulanceStaff.findById(dispatch.driverStaffId)
            .select("fcmToken")
            .lean()
        : null,
      dispatch.attendantStaffId
        ? AmbulanceStaff.findById(dispatch.attendantStaffId)
            .select("fcmToken")
            .lean()
        : null,
    ]);
    if ((driver as any)?.fcmToken) {
      await sendPushNotification(
        (driver as any).fcmToken,
        "Dispatch resolved",
        "An older case has been closed.",
        data,
      ).catch(() => {});
    }
    if ((attendant as any)?.fcmToken) {
      await sendPushNotification(
        (attendant as any).fcmToken,
        "Dispatch resolved",
        "An older case has been closed.",
        data,
      ).catch(() => {});
    }

    fixed++;
    console.log(
      `  dispatch ${dispatch._id} → COMPLETED  (ambulance ${dispatch.ambulanceId ?? "n/a"} freed)`,
    );
  }

  console.log(`\nReconciled ${fixed} orphaned dispatch(es).`);
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
