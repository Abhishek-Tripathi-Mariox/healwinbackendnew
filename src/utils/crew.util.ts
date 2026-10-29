import { Types } from "mongoose";
import AmbulanceStaff from "../models/ambulance-staff.model";

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

export interface CrewContact {
  id: string;
  role: "driver" | "attendant";
  name: string;
  phone: string;
}

/**
 * Everyone aboard, with a number to ring, labelled by seat.
 *
 * A patient was only ever given the driver's number. On a critical-care
 * transfer the driver is driving — the attendant is the one who can say
 * anything about the patient, and often the only one who can safely pick up.
 * The crew had the same gap in the other direction: neither could ring the
 * other without going through the control room.
 *
 * Reads through `attendantIdsOf` so it covers the attendant LIST and the
 * legacy single field, and returns an empty list rather than throwing when a
 * job has no crew assigned yet.
 */
export const crewContactsOf = async (
  doc:
    | {
        driverStaffId?: any;
        attendantStaffIds?: any[];
        attendantStaffId?: any;
        driverName?: string;
        driverPhone?: string;
      }
    | null
    | undefined,
): Promise<CrewContact[]> => {
  if (!doc) return [];

  const attendantIds = attendantIdsOf(doc as any);
  const driverRef: any = doc.driverStaffId;
  const driverId = driverRef ? String(driverRef._id ?? driverRef) : "";

  const ids = [...(driverId ? [driverId] : []), ...attendantIds];
  if (!ids.length) return [];

  const staff: any[] = await AmbulanceStaff.find({ _id: { $in: ids } })
    .select("fullName mobileNumber role")
    .lean();
  const byId = new Map(staff.map((s) => [String(s._id), s]));

  const out: CrewContact[] = [];
  if (driverId) {
    const s = byId.get(driverId);
    // The request carries a denormalised driver name/phone from assignment
    // time; fall back to it so a journey whose staff record was since deleted
    // still shows who drove.
    const name = s?.fullName || doc.driverName || "";
    const phone = s?.mobileNumber || doc.driverPhone || "";
    if (name || phone) out.push({ id: driverId, role: "driver", name, phone });
  }
  for (const id of attendantIds) {
    const s = byId.get(id);
    if (!s) continue;
    out.push({
      id,
      role: "attendant",
      name: s.fullName || "",
      phone: s.mobileNumber || "",
    });
  }
  return out;
};

export default {
  attendantIdsOf,
  crewIdsOf,
  crewFilter,
  ambulanceCrewFilter,
  crewContactsOf,
};
