import { Document, Types } from "mongoose";

/**
 * Roster slot — one paramedic on one ambulance for a defined window.
 *
 * The Shift collection is the source of truth for "who is operating which
 * ambulance when". The Ambulance model's `assignedDriverId` /
 * `assignedAttendantId` fields are now a denormalised cache of the
 * currently-active shift's staff, maintained by `ShiftStateMachine`. Admins
 * never write the cache directly — they create / edit Shift documents and
 * the ticker propagates.
 *
 * Status transitions (driven by ShiftStateMachine):
 *   scheduled --(startAt <= now)-->  active
 *   active    --(endAt <= now)-->    completed
 *   scheduled --(missed grace)-->    missed
 *   scheduled / active --(admin)-->  cancelled
 *
 * A staff member may have at most one ACTIVE shift at a time, but may have
 * many overlapping `scheduled` ones in the future (e.g. recurring roster).
 * Conflict detection happens at create/update time.
 */
export type ShiftStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled"
  | "missed";

export type ShiftRole = "driver" | "attendant";

export interface IShift extends Document {
  _id: Types.ObjectId;
  providerId: Types.ObjectId;
  ambulanceId: Types.ObjectId;
  // staffId is optional — shifts can be created as "open" slots (a
  // window on an ambulance with no one assigned yet) and a paramedic /
  // driver assigned later via the assign endpoint. An open shift is
  // never auto-activated by the state machine; activation requires a
  // staff member.
  staffId?: Types.ObjectId | null;
  role: ShiftRole;
  startAt: Date;
  endAt: Date;
  status: ShiftStatus;
  // Audit + clock-in/out times. clockInAt is set when the driver/attendant
  // taps "Clock in" in the app (allowed 15 min before startAt). clockOutAt
  // is set on explicit clock-out, OR auto-set to endAt by the state machine
  // when a shift completes without an explicit clock-out.
  clockInAt?: Date;
  clockOutAt?: Date;
  notes?: string;
  cancelReason?: string;
  // For rosters created in bulk (recurring weekly) we link back so admin
  // can edit / cancel the whole pattern at once.
  recurrenceId?: Types.ObjectId | null;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
