import { earnedDays, recomputeBalance } from "../services/leave-entitlement.service";

/**
 * How much leave someone has actually earned. Getting this wrong either hands
 * a November joiner a full year of leave, or takes days off someone who has
 * already booked them.
 */

const JAN = new Date(2026, 0, 15);
const JUL = new Date(2026, 6, 15);
const DEC = new Date(2026, 11, 31);

describe("annual entitlement", () => {
  it("gives the whole quota to someone on the rolls all year", () => {
    expect(
      earnedDays({ annualQuota: 12, accrual: "annual", year: 2026, asOf: JAN }),
    ).toBe(12);
  });

  it("pro-rates a joiner from their joining month", () => {
    // Joined 1 July → 6 months of 2026 → half of 12.
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "annual",
        year: 2026,
        joiningDate: new Date(2026, 6, 1),
        asOf: DEC,
      }),
    ).toBe(6);
  });

  it("counts the joining month itself, not just whole months after it", () => {
    // Joined 20 November → November and December → 2 of 12.
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "annual",
        year: 2026,
        joiningDate: new Date(2026, 10, 20),
        asOf: DEC,
      }),
    ).toBe(2);
  });

  it("gives nothing for a year before someone joined", () => {
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "annual",
        year: 2026,
        joiningDate: new Date(2027, 0, 1),
        asOf: DEC,
      }),
    ).toBe(0);
  });

  it("stops earning after an exit", () => {
    // Left at the end of March → 3 of 12.
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "annual",
        year: 2026,
        exitDate: new Date(2026, 2, 31),
        asOf: DEC,
      }),
    ).toBe(3);
  });

  it("is zero for a quota of zero, whatever the dates", () => {
    // Loss of Pay is a type with no entitlement at all.
    expect(earnedDays({ annualQuota: 0, accrual: "annual", year: 2026 })).toBe(0);
  });
});

describe("monthly accrual", () => {
  it("earns only by completed month", () => {
    // Mid-January: no month has finished yet.
    expect(
      earnedDays({ annualQuota: 12, accrual: "monthly", year: 2026, asOf: JAN }),
    ).toBe(0);
    // Mid-July: six months done.
    expect(
      earnedDays({ annualQuota: 12, accrual: "monthly", year: 2026, asOf: JUL }),
    ).toBe(6);
  });

  it("is the full quota once the year is behind us", () => {
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "monthly",
        year: 2026,
        asOf: new Date(2027, 3, 1),
      }),
    ).toBe(12);
  });

  it("earns nothing for a year that has not started", () => {
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "monthly",
        year: 2026,
        asOf: new Date(2025, 5, 1),
      }),
    ).toBe(0);
  });

  it("combines accrual with a mid-year joiner", () => {
    // Joined 1 April, asked in mid-July → April, May, June completed → 3.
    expect(
      earnedDays({
        annualQuota: 12,
        accrual: "monthly",
        year: 2026,
        joiningDate: new Date(2026, 3, 1),
        asOf: JUL,
      }),
    ).toBe(3);
  });

  it("rounds to a half day rather than a fraction nobody can take", () => {
    // 15 days over 12 months, 7 completed months = 8.75. Leave is taken in
    // half days, so it lands on the nearest one — and a tie rounds in the
    // employee's favour.
    expect(
      earnedDays({
        annualQuota: 15,
        accrual: "monthly",
        year: 2026,
        asOf: new Date(2026, 7, 10),
      }),
    ).toBe(9);
    // 10 days, 7 months = 5.833 → 6 is further than 5.5.
    expect(
      earnedDays({
        annualQuota: 10,
        accrual: "monthly",
        year: 2026,
        asOf: new Date(2026, 7, 10),
      }),
    ).toBe(6);
  });
});

describe("balance arithmetic", () => {
  it("adds what was carried in and takes off what was used", () => {
    expect(recomputeBalance({ allocated: 12, carriedForward: 3, used: 5 })).toBe(10);
  });

  it("treats missing parts as zero", () => {
    expect(recomputeBalance({})).toBe(0);
    expect(recomputeBalance({ allocated: 6 })).toBe(6);
  });

  it("can go negative when leave was approved past the entitlement", () => {
    // An override approval is allowed, and the register must show the debt
    // rather than quietly clamping it to zero.
    expect(recomputeBalance({ allocated: 2, carriedForward: 0, used: 5 })).toBe(-3);
  });
});
