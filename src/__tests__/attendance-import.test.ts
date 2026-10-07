import {
  parseClock,
  parseSheetDate,
  parseStatus,
} from "../controllers/admin/attendance-import.controller";

/**
 * Attendance feeds payroll loss-of-pay, so a cell read wrongly here costs
 * someone money. These pin the three readings a biometric export can get
 * wrong without looking wrong: the date order, the clock format, and what
 * HR types in a status column.
 */

const iso = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

describe("import date", () => {
  it("reads ISO as written", () => {
    expect(iso(parseSheetDate("2026-10-07"))).toBe("2026-10-07");
    expect(iso(parseSheetDate("2026/10/07"))).toBe("2026-10-07");
  });

  it("reads a slashed date day-first, the Indian convention", () => {
    // The whole reason this is not `new Date(s)`: that reads 07/10/2026 as
    // 10 July and writes a month of attendance onto the wrong days.
    expect(iso(parseSheetDate("07/10/2026"))).toBe("2026-10-07");
    expect(iso(parseSheetDate("7-10-2026"))).toBe("2026-10-07");
    expect(iso(parseSheetDate("07.10.2026"))).toBe("2026-10-07");
  });

  it("takes the date out of a device timestamp", () => {
    expect(iso(parseSheetDate("2026-10-07 09:15:00"))).toBe("2026-10-07");
  });

  it("refuses a date it cannot read rather than guessing", () => {
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("7 Oct 2026")).toBeNull();
    // 13 is not a month, so this is not a day-first date either.
    expect(parseSheetDate("07/13/2026")).toBeNull();
    // 31 February — rolls over in a Date, so it must be rejected explicitly.
    expect(parseSheetDate("31/02/2026")).toBeNull();
  });
});

describe("punch time", () => {
  it("normalises the formats devices export", () => {
    expect(parseClock("09:15")).toBe("09:15");
    expect(parseClock("9:15")).toBe("09:15");
    expect(parseClock("09:15:32")).toBe("09:15");
    expect(parseClock("2026-10-07 09:15:00")).toBe("09:15");
  });

  it("converts 12-hour times", () => {
    expect(parseClock("9:15 AM")).toBe("09:15");
    expect(parseClock("6:30 PM")).toBe("18:30");
    // Midnight and noon are the two that get inverted.
    expect(parseClock("12:05 AM")).toBe("00:05");
    expect(parseClock("12:05 PM")).toBe("12:05");
  });

  it("treats a device's empty markers as no punch", () => {
    expect(parseClock("")).toBeNull();
    expect(parseClock("--:--")).toBeNull();
    expect(parseClock("N/A")).toBeNull();
    expect(parseClock("-")).toBeNull();
  });

  it("refuses an impossible time", () => {
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("09:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});

describe("status column", () => {
  it("accepts the short forms HR actually types", () => {
    expect(parseStatus("P")).toBe("present");
    expect(parseStatus("a")).toBe("absent");
    expect(parseStatus("HD")).toBe("half_day");
    expect(parseStatus("Half Day")).toBe("half_day");
    expect(parseStatus("L")).toBe("leave");
    expect(parseStatus("WO")).toBe("week_off");
    expect(parseStatus("week off")).toBe("week_off");
    expect(parseStatus("week_off")).toBe("week_off");
  });

  it("is blank for a blank cell, so the hours decide instead", () => {
    expect(parseStatus("")).toBeNull();
    expect(parseStatus("   ")).toBeNull();
  });

  it("refuses something it does not recognise rather than guessing", () => {
    // Silently mapping an unknown code to "present" would pay for a day
    // nobody worked.
    expect(parseStatus("XYZ")).toBeNull();
    expect(parseStatus("maybe")).toBeNull();
  });
});
