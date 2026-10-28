import {
  CANCELLABLE,
  CREW_CANCEL_REASONS,
  crewReasonLabel,
  isCancellable,
} from "../services/dispatch-cancel.service";

/**
 * Who may call off an ambulance, and until when. The cut-off is the whole
 * safety rule: once the patient is in the vehicle, a "cancel" from a phone
 * must not strand them.
 */

describe("when a dispatch can still be cancelled", () => {
  it("allows it up to the crew arriving on scene", () => {
    expect(isCancellable("DISPATCHED")).toBe(true);
    expect(isCancellable("ACKNOWLEDGED")).toBe(true);
    expect(isCancellable("EN_ROUTE")).toBe(true);
    expect(isCancellable("ON_SCENE")).toBe(true);
  });

  it("refuses once the trip is under way", () => {
    // The patient is aboard. Ending the dispatch here would leave them in a
    // vehicle with no job attached to it.
    expect(isCancellable("ON_TRIP")).toBe(false);
  });

  it("refuses a dispatch that is already finished", () => {
    expect(isCancellable("COMPLETED")).toBe(false);
    expect(isCancellable("CANCELLED")).toBe(false);
  });

  it("refuses a missing status rather than defaulting to allowed", () => {
    expect(isCancellable(undefined)).toBe(false);
    expect(isCancellable("")).toBe(false);
    expect(isCancellable("nonsense")).toBe(false);
  });

  it("lists exactly the four cancellable states", () => {
    expect([...CANCELLABLE]).toEqual([
      "DISPATCHED",
      "ACKNOWLEDGED",
      "EN_ROUTE",
      "ON_SCENE",
    ]);
  });
});

describe("crew cancellation reasons", () => {
  it("turns a code into something the control room can read", () => {
    expect(crewReasonLabel("vehicle_breakdown")).toBe("Vehicle breakdown");
    expect(crewReasonLabel("too_far")).toBe("Too far to reach in time");
  });

  it("falls back for a missing or unknown code instead of showing the raw value", () => {
    expect(crewReasonLabel(undefined)).toBe("Crew could not take the call");
    expect(crewReasonLabel("")).toBe("Crew could not take the call");
    expect(crewReasonLabel("made_up")).toBe("Crew could not take the call");
  });

  it("offers a reason for every way a run realistically falls through", () => {
    // Ops count these, so the list is part of the contract with the app.
    expect(Object.keys(CREW_CANCEL_REASONS)).toEqual([
      "vehicle_breakdown",
      "out_of_fuel",
      "too_far",
      "traffic_blocked",
      "wrong_assignment",
      "crew_unavailable",
      "medical_emergency",
      "other",
    ]);
  });
});
