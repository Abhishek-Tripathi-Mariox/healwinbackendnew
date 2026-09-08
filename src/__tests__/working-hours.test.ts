import {
  parseHHmm,
  formatHHmm,
  isOvernightShift,
  shiftLengthMinutes,
  computeWorkedMinutes,
  computeOvertimeMinutes,
  isLateArrival,
  deriveDayStatus,
  computeDay,
  formatDuration,
  ShiftTiming,
} from "../services/working-hours";

/** The shift structure named in the HRMS spec. */
const GENERAL: ShiftTiming = {
  startTime: "09:00",
  endTime: "17:00",
  breakMinutes: 30,
  graceMinutes: 10,
  fullDayMinutes: 450,
  halfDayMinutes: 225,
  overtimeAfterMinutes: 30,
};
const NIGHT: ShiftTiming = {
  startTime: "19:00",
  endTime: "07:00",
  breakMinutes: 60,
  graceMinutes: 15,
  fullDayMinutes: 660,
  halfDayMinutes: 330,
  overtimeAfterMinutes: 30,
};

describe("clock parsing", () => {
  it("reads and writes HH:mm", () => {
    expect(parseHHmm("09:30")).toBe(570);
    expect(parseHHmm("00:00")).toBe(0);
    expect(parseHHmm("23:59")).toBe(1439);
    expect(formatHHmm(570)).toBe("09:30");
  });
  it("rejects nonsense rather than guessing", () => {
    expect(parseHHmm("")).toBeNull();
    expect(parseHHmm("9am")).toBeNull();
    expect(parseHHmm("25:00")).toBeNull();
    expect(parseHHmm("09:75")).toBeNull();
    expect(parseHHmm(undefined)).toBeNull();
  });
});

describe("shift length", () => {
  it("measures a normal shift net of break", () => {
    expect(shiftLengthMinutes(GENERAL)).toBe(450); // 8h - 30m
    expect(isOvernightShift(GENERAL)).toBe(false);
  });
  it("measures an overnight shift across midnight", () => {
    expect(isOvernightShift(NIGHT)).toBe(true);
    expect(shiftLengthMinutes(NIGHT)).toBe(660); // 12h - 60m
  });
});

describe("worked minutes", () => {
  it("computes a normal day", () => {
    expect(computeWorkedMinutes("09:00", "17:00", GENERAL)).toBe(450);
  });
  it("treats a check-out before check-in as crossing midnight, not negative", () => {
    expect(computeWorkedMinutes("19:00", "07:00", NIGHT)).toBe(660);
  });
  it("returns null when a punch is missing — that is a missed punch, not zero", () => {
    expect(computeWorkedMinutes("09:00", null, GENERAL)).toBeNull();
    expect(computeWorkedMinutes(null, "17:00", GENERAL)).toBeNull();
    expect(computeWorkedMinutes("bad", "17:00", GENERAL)).toBeNull();
  });
  it("never returns less than zero", () => {
    expect(computeWorkedMinutes("09:00", "09:10", GENERAL)).toBe(0); // break exceeds span
  });
});

describe("overtime", () => {
  it("ignores an overrun inside the buffer", () => {
    const worked = computeWorkedMinutes("09:00", "17:20", GENERAL)!; // 470
    expect(computeOvertimeMinutes(worked, GENERAL)).toBe(0); // 20m overrun < 30m buffer
  });
  it("counts the whole overrun once the buffer is passed", () => {
    const worked = computeWorkedMinutes("09:00", "19:00", GENERAL)!; // 570
    expect(computeOvertimeMinutes(worked, GENERAL)).toBe(120);
  });
  it("never returns negative overtime for a short day", () => {
    expect(computeOvertimeMinutes(200, GENERAL)).toBe(0);
  });
  it("works across midnight", () => {
    const worked = computeWorkedMinutes("19:00", "09:00", NIGHT)!; // 780
    expect(computeOvertimeMinutes(worked, NIGHT)).toBe(120);
  });
});

describe("lateness", () => {
  it("allows the grace period", () => {
    expect(isLateArrival("09:10", GENERAL)).toBe(false);
    expect(isLateArrival("09:11", GENERAL)).toBe(true);
    expect(isLateArrival("08:45", GENERAL)).toBe(false);
  });
  it("measures lateness on the night shift's own clock", () => {
    // The wrap-around exists so an after-midnight punch is not read as
    // "arrived 18 hours early". Someone turning up at 00:30 for a 19:00 shift
    // really is 5h30m late, and someone at 06:00 really is nearly a full
    // shift late — both must register as late, not as early.
    expect(isLateArrival("18:50", NIGHT)).toBe(false); // ten minutes early
    expect(isLateArrival("19:10", NIGHT)).toBe(false); // inside the 15m grace
    expect(isLateArrival("19:30", NIGHT)).toBe(true);
    expect(isLateArrival("00:30", NIGHT)).toBe(true);
    expect(isLateArrival("06:00", NIGHT)).toBe(true);
  });
});

describe("derived day status", () => {
  it("grades the day against the shift", () => {
    expect(deriveDayStatus(450, GENERAL)).toBe("present");
    expect(deriveDayStatus(300, GENERAL)).toBe("half_day");
    expect(deriveDayStatus(100, GENERAL)).toBe("absent");
  });
});

describe("computeDay", () => {
  it("rolls up a full overtime night", () => {
    const d = computeDay("19:00", "09:00", NIGHT)!;
    expect(d.workedMinutes).toBe(780);
    expect(d.overtimeMinutes).toBe(120);
    expect(d.derivedStatus).toBe("present");
    expect(d.isLate).toBe(false);
  });
  it("returns null for a missed punch so the caller can flag it", () => {
    expect(computeDay("09:00", undefined, GENERAL)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("renders for humans", () => {
    expect(formatDuration(450)).toBe("7h 30m");
    expect(formatDuration(60)).toBe("1h 00m");
    expect(formatDuration(0)).toBe("0h 00m");
  });
});
