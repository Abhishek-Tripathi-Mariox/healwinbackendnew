import { Types } from "mongoose";

/**
 * Who is crewing a vehicle or a job.
 *
 * Attendants used to be a single id in three places — on the ambulance, on an
 * `AmbulanceRequest` and on an `EmergencyDispatch`. A critical-care transfer
 * routinely carries two (a nurse and a technician), and with one field the
 * second one simply overwrote the first: they never got the ring, never saw
 * the case, and the control room had no record they were aboard.
 *
 * Each of those now has a LIST, and the old singular field is kept readable so
 * journeys and vehicles crewed before the change still resolve. Everything
 * reads through here rather than touching either field, so there is one answer
 * to "who is on this" and no caller has to know which shape it got.
 */

type Id = Types.ObjectId | string | null | undefined;

interface HasAttendants {
  attendantStaffIds?: Id[];
  attendantStaffId?: Id;
  assignedAttendantIds?: Id[];
  assignedAttendantId?: Id;
}

/** Deduplicated, in order, with blanks dropped. */
const clean = (ids: Id[]): string[] => {
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    // A populated ref arrives as a document, not an id.
    const s = String((id as any)?._id ?? id);
    if (s && s !== "undefined" && s !== "null" && !out.includes(s)) out.push(s);
  }
  return out;
};

/**
 * Every attendant on a dispatch, request or ambulance, as id strings.
 *
 * The list wins when it has anything in it; the legacy single field is the
 * fallback. They are not merged — a record that has been written since the
 * change carries its full crew in the list, and merging would resurrect an
 * attendant who was deliberately removed.
 */
export const attendantIdsOf = (doc: HasAttendants | null | undefined): string[] => {
  if (!doc) return [];
  const list = doc.attendantStaffIds ?? doc.assignedAttendantIds;
  if (Array.isArray(list) && list.length) return clean(list);
  const single = doc.attendantStaffId ?? doc.assignedAttendantId;
  return clean([single]);
};

/** The driver plus every attendant — who to ring, notify or clear. */
export const crewIdsOf = (
  doc: (HasAttendants & { driverStaffId?: Id; assignedDriverId?: Id }) | null | undefined,
): string[] => {
  if (!doc) return [];
  const driver = doc.driverStaffId ?? doc.assignedDriverId;
  return clean([driver, ...attendantIdsOf(doc)]);
};

/**
 * Mongo filter for "this job belongs to this crew member", covering driver,
 * the attendant list and the legacy single attendant in one `$or`.
 */
export const crewFilter = (staffId: Id) => ({
  $or: [
    { driverStaffId: staffId },
    { attendantStaffIds: staffId },
    { attendantStaffId: staffId },
  ],
});

/**
 * Mongo filter for "this staff member is crewing this AMBULANCE", covering the
 * driver seat, the attendant list and the legacy single attendant.
 */
export const ambulanceCrewFilter = (staffId: Id) => ({
  $or: [
    { assignedDriverId: staffId },
    { assignedAttendantIds: staffId },
    { assignedAttendantId: staffId },
  ],
});

export default { attendantIdsOf, crewIdsOf, crewFilter, ambulanceCrewFilter };
