/**
 * Shift state machine — the heartbeat that turns shift documents into
 * "who is currently driving ambulance X" reality.
 *
 * Runs server-side every `TICK_MS`. On each tick it:
 *   1. Transitions scheduled shifts whose `startAt <= now` to `active`,
 *      and writes the ambulance's assigned driver/attendant cache so the
 *      existing dispatch query keeps working without modification.
 *   2. Transitions active shifts whose `endAt <= now` to `completed`,
 *      clears the cache, and auto-fills `clockOutAt` if the user didn't
 *      explicitly clock out.
 *   3. Transitions still-scheduled shifts whose `startAt + MISSED_GRACE_MS`
 *      has passed to `missed` so the dispatcher sees an alert and the
 *      ambulance isn't held for a no-show.
 *
 * Idempotent — running twice in the same second is harmless. Survives
 * server restart by querying current state from the DB, no in-memory queue.
 */
import { Types } from "mongoose";
import Shift from "../models/shift.model";
import Ambulance from "../models/ambulance.model";
import { sendToStaff } from "./notification.service";

const TICK_MS = 30 * 1000; // 30 seconds — good enough granularity for shift swaps
const MISSED_GRACE_MS = 15 * 60 * 1000; // 15 minutes past startAt without clock-in = missed
const REMINDER_WINDOW_MS = 45 * 60 * 1000; // remind 45 minutes before shift start

let timer: NodeJS.Timeout | null = null;

/**
 * Start one shift that has just begun. Writes its staff to the ambulance
 * cache field for its role. If the existing cache holds a *different* staff
 * (i.e. an active shift didn't end cleanly — server crash, missed sweep),
 * we overwrite, because the new shift is the authoritative one as of now.
 */
const activateShift = async (shiftId: Types.ObjectId) => {
  const shift = await Shift.findOneAndUpdate(
    { _id: shiftId, status: "scheduled" },
    { status: "active" },
    { returnDocument: "after" },
  );
  if (!shift) return; // already moved on by another worker
  const field =
    shift.role === "driver" ? "assignedDriverId" : "assignedAttendantId";
  await Ambulance.updateOne(
    { _id: shift.ambulanceId },
    { $set: { [field]: shift.staffId } },
  );
};

const completeShift = async (shiftId: Types.ObjectId) => {
  const shift = await Shift.findOneAndUpdate(
    { _id: shiftId, status: "active" },
    {
      status: "completed",
      clockOutAt: new Date(),
    },
    { returnDocument: "after" },
  );
  if (!shift) return;
  const field =
    shift.role === "driver" ? "assignedDriverId" : "assignedAttendantId";
  // Only clear the cache if we still hold THIS staff member — otherwise a
  // back-to-back shift handoff would race and clear the new shift's crew.
  await Ambulance.updateOne(
    { _id: shift.ambulanceId, [field]: shift.staffId },
    { $set: { [field]: null } },
  );
};

const markMissed = async (shiftId: Types.ObjectId) => {
  await Shift.updateOne(
    { _id: shiftId, status: "scheduled" },
    { status: "missed" },
  );
  // Missed shifts never had their staff written to the cache, so nothing
  // to clear — but emitting a dispatcher notification here would be a
  // good follow-up.
};

/** Push a "your shift starts soon" reminder, exactly once per shift. */
const remindShift = async (shift: { _id: Types.ObjectId; staffId: Types.ObjectId; startAt: Date }) => {
  const claimed = await Shift.findOneAndUpdate(
    { _id: shift._id, reminderSentAt: null },
    { reminderSentAt: new Date() },
  );
  if (!claimed) return; // another tick/worker already sent it
  const inMin = Math.round((new Date(shift.startAt).getTime() - Date.now()) / 60000);
  await sendToStaff(
    shift.staffId,
    "SYSTEM",
    "Upcoming shift",
    `Your shift starts in about ${Math.max(inMin, 0)} minute(s).`,
    { screen: "MyShifts", shiftId: String(shift._id) },
  );
};

export const tick = async () => {
  const now = new Date();

  // Only activate scheduled shifts that have an actual person assigned.
  // Open / unassigned shifts (staffId null) just sit as scheduled
  // forever until either an admin assigns someone or the end time
  // passes — at which point the missed-sweep below flips them to
  // "missed" so they show up on the unfilled-shifts report.
  const toActivate = await Shift.find({
    status: "scheduled",
    startAt: { $lte: now },
    endAt: { $gt: now },
    staffId: { $ne: null },
  })
    .select("_id")
    .lean();
  for (const s of toActivate) {
    try {
      await activateShift(s._id as Types.ObjectId);
    } catch (err) {
      console.error("[Shift] activate failed", s._id, err);
    }
  }

  const toComplete = await Shift.find({
    status: "active",
    endAt: { $lte: now },
  })
    .select("_id")
    .lean();
  for (const s of toComplete) {
    try {
      await completeShift(s._id as Types.ObjectId);
    } catch (err) {
      console.error("[Shift] complete failed", s._id, err);
    }
  }

  const missedCutoff = new Date(now.getTime() - MISSED_GRACE_MS);
  const toMiss = await Shift.find({
    status: "scheduled",
    startAt: { $lte: missedCutoff },
  })
    .select("_id")
    .lean();
  for (const s of toMiss) {
    try {
      await markMissed(s._id as Types.ObjectId);
    } catch (err) {
      console.error("[Shift] mark missed failed", s._id, err);
    }
  }

  // Remind assigned staff shortly before their shift starts. reminderSentAt
  // is claimed atomically per-shift (see remindShift) so this is safe to
  // just re-query every tick within the window rather than tracking state
  // here.
  const toRemind = await Shift.find({
    status: "scheduled",
    staffId: { $ne: null },
    reminderSentAt: null,
    startAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
  })
    .select("_id staffId startAt")
    .lean();
  for (const s of toRemind) {
    try {
      await remindShift(s as any);
    } catch (err) {
      console.error("[Shift] remind failed", s._id, err);
    }
  }

  if (toActivate.length || toComplete.length || toMiss.length || toRemind.length) {
    console.log(
      `[Shift] tick: +${toActivate.length} active  -${toComplete.length} completed  ?${toMiss.length} missed  🔔${toRemind.length} reminded`,
    );
  }
};

export const startShiftStateMachine = () => {
  if (timer) return;
  // Fire one immediately so a freshly-started server picks up shifts that
  // should already be active rather than waiting a full tick.
  tick().catch((err) => console.error("[Shift] initial tick failed", err));
  timer = setInterval(() => {
    tick().catch((err) => console.error("[Shift] tick failed", err));
  }, TICK_MS);
  console.log(`[Shift] State machine started (tick every ${TICK_MS}ms)`);
};

export const stopShiftStateMachine = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};
