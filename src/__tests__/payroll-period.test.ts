import {
  payrollPeriod,
  periodForDate,
  daysInCalendarMonth,
} from "../services/payroll-period";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("payrollPeriod", () => {
  describe("calendar month (cycle start 1)", () => {
    it("covers the whole month", () => {
      const p = payrollPeriod(9, 2026, 1);
      expect(iso(p.start)).toBe("2026-09-01");
      expect(iso(p.end)).toBe("2026-09-30");
      expect(p.totalDays).toBe(30);
    });

    it("handles February in a leap year", () => {
      const p = payrollPeriod(2, 2028, 1);
      expect(p.totalDays).toBe(29);
      expect(iso(p.end)).toBe("2028-02-29");
    });

    it("is the default when no cycle is given", () => {
      expect(payrollPeriod(9, 2026).totalDays).toBe(30);
    });
  });

  describe("16th-to-15th cycle", () => {
    it("runs from the 16th to the 15th of the next month", () => {
      const p = payrollPeriod(9, 2026, 16);
      expect(iso(p.start)).toBe("2026-09-16");
      expect(iso(p.end)).toBe("2026-10-15");
    });

    it("is named after the month it STARTS in", () => {
      const p = payrollPeriod(9, 2026, 16);
      expect(p.month).toBe(9);
      expect(p.year).toBe(2026);
      expect(p.label).toBe("16 Sep 2026 – 15 Oct 2026");
    });

    it("counts the days it actually spans, not the calendar month's", () => {
      // 16 Sep – 15 Oct = 15 days of September + 15 of October.
      expect(payrollPeriod(9, 2026, 16).totalDays).toBe(30);
      // 16 Jan – 15 Feb = 16 + 15.
      expect(payrollPeriod(1, 2026, 16).totalDays).toBe(31);
    });

    it("rolls the year over in December", () => {
      const p = payrollPeriod(12, 2026, 16);
      expect(iso(p.start)).toBe("2026-12-16");
      expect(iso(p.end)).toBe("2027-01-15");
    });

    it("leaves no gap or overlap between consecutive runs", () => {
      for (let m = 1; m <= 12; m++) {
        const cur = payrollPeriod(m, 2026, 16);
        const next = payrollPeriod(m === 12 ? 1 : m + 1, m === 12 ? 2027 : 2026, 16);
        const dayAfterEnd = new Date(cur.end);
        dayAfterEnd.setHours(0, 0, 0, 0);
        dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
        expect(iso(dayAfterEnd)).toBe(iso(next.start));
      }
    });

    it("every day of a year falls in exactly one run", () => {
      const covered = new Set<string>();
      for (let m = 1; m <= 12; m++) {
        const p = payrollPeriod(m, 2026, 16);
        const d = new Date(p.start);
        while (d <= p.end) {
          const key = iso(d);
          expect(covered.has(key)).toBe(false); // no day counted twice
          covered.add(key);
          d.setDate(d.getDate() + 1);
        }
      }
      // 16 Jan 2026 through 15 Jan 2027 — a full year of days.
      expect(covered.size).toBe(365);
    });
  });

  describe("short months", () => {
    it("clamps a 31st cycle into February", () => {
      const p = payrollPeriod(2, 2026, 31);
      expect(iso(p.start)).toBe("2026-02-28");
      expect(iso(p.end)).toBe("2026-03-30");
    });

    it("clamps a 30th cycle into February and stays contiguous", () => {
      const feb = payrollPeriod(2, 2026, 30);
      const mar = payrollPeriod(3, 2026, 30);
      const after = new Date(feb.end);
      after.setHours(0, 0, 0, 0);
      after.setDate(after.getDate() + 1);
      expect(iso(after)).toBe(iso(mar.start));
    });
  });

  describe("bad input", () => {
    it("treats 0 and negatives as a calendar month", () => {
      expect(payrollPeriod(9, 2026, 0).totalDays).toBe(30);
      expect(payrollPeriod(9, 2026, -5).totalDays).toBe(30);
    });
    it("caps a start day above 31", () => {
      expect(iso(payrollPeriod(9, 2026, 99).start)).toBe("2026-09-30");
    });
  });
});

describe("periodForDate", () => {
  it("files a date on or after the cycle start under that month", () => {
    expect(periodForDate("2026-09-16", 16)).toEqual({ month: 9, year: 2026 });
    expect(periodForDate("2026-09-30", 16)).toEqual({ month: 9, year: 2026 });
  });

  it("files a date before the cycle start under the previous month", () => {
    expect(periodForDate("2026-10-15", 16)).toEqual({ month: 9, year: 2026 });
    expect(periodForDate("2026-10-01", 16)).toEqual({ month: 9, year: 2026 });
  });

  it("rolls back across the new year", () => {
    expect(periodForDate("2027-01-15", 16)).toEqual({ month: 12, year: 2026 });
  });

  it("is the plain calendar month on a cycle of 1", () => {
    expect(periodForDate("2026-10-01", 1)).toEqual({ month: 10, year: 2026 });
  });

  it("agrees with payrollPeriod for every day of a year", () => {
    const d = new Date(2026, 0, 1);
    while (d < new Date(2027, 0, 1)) {
      const { month, year } = periodForDate(d, 16);
      const p = payrollPeriod(month, year, 16);
      const at = new Date(d);
      at.setHours(12, 0, 0, 0);
      expect(at >= p.start && at <= p.end).toBe(true);
      d.setDate(d.getDate() + 1);
    }
  });
});

describe("daysInCalendarMonth", () => {
  it("knows the month lengths", () => {
    expect(daysInCalendarMonth(2, 2026)).toBe(28);
    expect(daysInCalendarMonth(2, 2028)).toBe(29);
    expect(daysInCalendarMonth(9, 2026)).toBe(30);
    expect(daysInCalendarMonth(12, 2026)).toBe(31);
  });
});
