import { isWeekOff, patternFor, eachDay, dateKey } from "../services/week-off.service";

const org = { days: [0], saturdays: [2, 4] };
const day = (iso: string) => new Date(`${iso}T00:00:00`);

describe("week off pattern", () => {
  it("treats every listed weekday as off", () => {
    // 2026-10-04 is a Sunday, 2026-10-05 a Monday.
    expect(isWeekOff(day("2026-10-04"), { days: [0], saturdays: [] })).toBe(true);
    expect(isWeekOff(day("2026-10-05"), { days: [0], saturdays: [] })).toBe(false);
  });

  it("applies the nth-Saturday rule and nothing else", () => {
    // October 2026 Saturdays: 3rd (1st), 10th (2nd), 17th (3rd), 24th (4th).
    expect(isWeekOff(day("2026-10-03"), org)).toBe(false);
    expect(isWeekOff(day("2026-10-10"), org)).toBe(true);
    expect(isWeekOff(day("2026-10-17"), org)).toBe(false);
    expect(isWeekOff(day("2026-10-24"), org)).toBe(true);
  });

  it("counts Saturdays by position in the month, not by week number", () => {
    // November 2026 starts on a Sunday, so its first Saturday is the 7th —
    // an ordinal derived from the date, not from the calendar grid.
    expect(isWeekOff(day("2026-11-07"), { days: [], saturdays: [1] })).toBe(true);
    expect(isWeekOff(day("2026-11-14"), { days: [], saturdays: [1] })).toBe(false);
  });

  it("falls back to the org pattern only when the employee has none", () => {
    expect(patternFor({}, org)).toEqual(org);
    expect(patternFor({ weekOffDays: [] }, org)).toEqual(org);
    expect(patternFor({ weekOffDays: [1] }, org)).toEqual({
      days: [1],
      saturdays: org.saturdays,
    });
  });

  it("expands an inclusive date range across a month boundary", () => {
    const days = eachDay("2026-10-30", "2026-11-02").map(dateKey);
    expect(days).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("expands a single day to that one day", () => {
    expect(eachDay("2026-10-30", "2026-10-30").map(dateKey)).toEqual(["2026-10-30"]);
  });
});
