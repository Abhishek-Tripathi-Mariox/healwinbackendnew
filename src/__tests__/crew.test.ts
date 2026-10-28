import { attendantIdsOf, crewIdsOf, crewFilter } from "../utils/crew.util";

/**
 * One ambulance can carry several attendants, but records written before that
 * change carry a single id. Everything resolves through these, so they have to
 * handle both shapes — and must never merge them, or an attendant who was
 * removed comes back.
 */

describe("attendants on a job", () => {
  it("reads the list when there is one", () => {
    expect(attendantIdsOf({ attendantStaffIds: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("falls back to the legacy single field", () => {
    // A dispatch created before attendants became a list.
    expect(attendantIdsOf({ attendantStaffId: "a" })).toEqual(["a"]);
    expect(attendantIdsOf({ attendantStaffIds: [], attendantStaffId: "a" })).toEqual(["a"]);
  });

  it("does NOT merge the two", () => {
    // "b" was removed from the crew and the list rewritten; the stale single
    // field must not put them back on the job.
    expect(attendantIdsOf({ attendantStaffIds: ["a"], attendantStaffId: "b" })).toEqual(["a"]);
  });

  it("reads an ambulance's own crew fields too", () => {
    expect(attendantIdsOf({ assignedAttendantIds: ["x", "y"] })).toEqual(["x", "y"]);
    expect(attendantIdsOf({ assignedAttendantId: "x" })).toEqual(["x"]);
  });

  it("handles populated refs, not just ids", () => {
    // `.populate("attendantStaffIds")` hands back documents.
    expect(
      attendantIdsOf({ attendantStaffIds: [{ _id: "a", fullName: "Asha" } as any] }),
    ).toEqual(["a"]);
  });

  it("drops blanks and duplicates", () => {
    expect(
      attendantIdsOf({ attendantStaffIds: ["a", null, "a", undefined, "b"] }),
    ).toEqual(["a", "b"]);
    expect(attendantIdsOf({})).toEqual([]);
    expect(attendantIdsOf(null)).toEqual([]);
  });
});

describe("whole crew", () => {
  it("puts the driver first, then the attendants", () => {
    expect(
      crewIdsOf({ driverStaffId: "d", attendantStaffIds: ["a", "b"] }),
    ).toEqual(["d", "a", "b"]);
  });

  it("is just the driver when nobody rides along", () => {
    expect(crewIdsOf({ driverStaffId: "d" })).toEqual(["d"]);
  });

  it("does not list someone twice when they are both", () => {
    // Shouldn't happen, but a duplicated id would send two rings to one phone.
    expect(crewIdsOf({ driverStaffId: "d", attendantStaffIds: ["d"] })).toEqual(["d"]);
  });

  it("is empty for an unassigned job", () => {
    expect(crewIdsOf({})).toEqual([]);
  });
});

describe("crew filter", () => {
  it("matches a driver, a listed attendant, or a legacy single attendant", () => {
    // All three must be covered: a crew member whose old job used the singular
    // field would otherwise lose their active card.
    expect(crewFilter("s1")).toEqual({
      $or: [
        { driverStaffId: "s1" },
        { attendantStaffIds: "s1" },
        { attendantStaffId: "s1" },
      ],
    });
  });
});
