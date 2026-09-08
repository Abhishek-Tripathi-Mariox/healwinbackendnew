import { computePayslip, daysInMonth, AttendanceSummary } from "../services/payroll.service";
import { ISalaryStructure } from "../models/hr-employee.model";

/** A salary structure whose full monthly gross is 25,000 (above the ESI ceiling). */
const salary = (over: Partial<ISalaryStructure> = {}): ISalaryStructure =>
  ({
    ctcAnnual: 300000,
    basic: 12000,
    hra: 6000,
    conveyance: 2000,
    medical: 1000,
    specialAllowance: 4000,
    otherAllowances: [],
    pfApplicable: true,
    esiApplicable: true,
    ptApplicable: true,
    ...over,
  }) as ISalaryStructure;

/** A 30-day month, fully served, with `lop` loss-of-pay days. */
const summary = (over: Partial<AttendanceSummary> = {}): AttendanceSummary => {
  const totalDays = 30;
  const serviceDays = over.serviceDays ?? totalDays;
  const lopDays = over.lopDays ?? 0;
  return {
    totalDays,
    serviceDays,
    unmarkedDays: 0,
    presentDays: serviceDays - lopDays,
    workedMinutes: 0,
    overtimeMinutes: 0,
    halfDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    holidayDays: 0,
    weekOffDays: 0,
    absentDays: lopDays,
    paidDays: serviceDays - lopDays,
    lopDays,
    ...over,
  };
};

describe("daysInMonth", () => {
  it("handles month lengths and leap years", () => {
    expect(daysInMonth(2, 2024)).toBe(29);
    expect(daysInMonth(2, 2025)).toBe(28);
    expect(daysInMonth(4, 2025)).toBe(30);
    expect(daysInMonth(12, 2025)).toBe(31);
  });
});

describe("computePayslip — proration", () => {
  it("pays a full month when every day is served", () => {
    const p = computePayslip(salary(), summary());
    expect(p.earnings.gross).toBe(25000);
    expect(p.deductions.lop).toBe(0);
  });

  it("prorates a mid-month joiner by days on the rolls, not days in the month", () => {
    // Joined on the 28th of a 30-day month → 3 service days, no LOP.
    const p = computePayslip(salary(), summary({ serviceDays: 3, paidDays: 3 }));
    expect(p.earnings.gross).toBe(2500); // 25000 * 3/30
    expect(p.serviceDays).toBe(3);
    // The 27 days before joining are NOT loss of pay — they were never owed.
    expect(p.lopDays).toBe(0);
  });

  it("charges LOP days against the served window", () => {
    const p = computePayslip(salary(), summary({ lopDays: 6 }));
    expect(p.earnings.gross).toBe(20000); // 25000 * 24/30
    expect(p.deductions.lop).toBe(5000); // shown as a deduction line
  });
});

describe("computePayslip — statutory eligibility", () => {
  it("does NOT start deducting ESI just because LOP dragged earnings under the ceiling", () => {
    // Contractual gross 25,000 is above the 21,000 ESI ceiling, so this
    // employee is not an ESI member. A heavy-LOP month earning 10,000 must not
    // turn them into one.
    const p = computePayslip(salary(), summary({ lopDays: 18 }));
    expect(p.earnings.gross).toBe(10000);
    expect(p.deductions.esi).toBe(0);
  });

  it("deducts ESI on earned wages for an employee genuinely under the ceiling", () => {
    const low = salary({ basic: 8000, hra: 4000, conveyance: 1000, medical: 500, specialAllowance: 1500 });
    const p = computePayslip(low, summary()); // full gross 15,000
    expect(p.earnings.gross).toBe(15000);
    expect(p.deductions.esi).toBe(112.5); // 0.75% of earned gross
  });

  it("keeps professional tax on a heavy-LOP month for a PT-liable employee", () => {
    const p = computePayslip(salary(), summary({ lopDays: 20 }));
    expect(p.deductions.professionalTax).toBe(200);
  });

  it("honours the per-employee applicability flags", () => {
    const p = computePayslip(
      salary({ pfApplicable: false, esiApplicable: false, ptApplicable: false }),
      summary(),
    );
    expect(p.deductions.pf).toBe(0);
    expect(p.deductions.esi).toBe(0);
    expect(p.deductions.professionalTax).toBe(0);
  });
});

describe("computePayslip — PF", () => {
  it("caps PF at the statutory wage ceiling", () => {
    // Basic 12,000 is under the 15,000 ceiling → 12% of basic.
    expect(computePayslip(salary(), summary()).deductions.pf).toBe(1440);
    // Basic 20,000 is over it → capped at 12% of 15,000 = 1,800.
    const high = salary({ basic: 20000, specialAllowance: 0 });
    expect(computePayslip(high, summary()).deductions.pf).toBe(1800);
  });
});

describe("computePayslip — overtime (§5)", () => {
  // Basic 12,000 over the standard 26 days x 8 hours = Rs 57.6923/hour.
  it("pays overtime on basic at the statutory 2x by default", () => {
    const p = computePayslip(salary(), summary({ overtimeMinutes: 600 })); // 10h
    expect(p.overtimeMinutes).toBe(600);
    expect(p.earnings.overtime).toBe(1153.85); // 10 * 57.6923 * 2
    expect(p.earnings.gross).toBe(25000 + 1153.85);
  });

  it("honours a multiplier the run supplies, for when HR confirms its policy", () => {
    const p = computePayslip(salary(), summary({ overtimeMinutes: 600 }), {
      overtimeMultiplier: 1,
    });
    expect(p.earnings.overtime).toBe(576.92);
  });

  it("pays nothing when no overtime was worked", () => {
    expect(computePayslip(salary(), summary()).earnings.overtime).toBe(0);
  });

  it("does NOT let overtime inflate the LOP line", () => {
    // LOP measures what proration took away. Overtime is extra on top, so a
    // month with both must still show LOP as the shortfall on the salary.
    const p = computePayslip(
      salary(),
      summary({ lopDays: 6, overtimeMinutes: 600 }),
    );
    expect(p.deductions.lop).toBe(5000); // 25000 * 6/30, overtime excluded
  });

  it("does not charge PF on overtime", () => {
    const withOt = computePayslip(salary(), summary({ overtimeMinutes: 600 }));
    const without = computePayslip(salary(), summary());
    expect(withOt.deductions.pf).toBe(without.deductions.pf);
  });

  it("keeps ESI eligibility on contractual wage even when overtime is paid", () => {
    // Full gross 25,000 is above the ceiling; overtime must not change that.
    const p = computePayslip(salary(), summary({ overtimeMinutes: 1200 }));
    expect(p.deductions.esi).toBe(0);
  });
});

describe("computePayslip — net pay", () => {
  it("nets earned gross minus deductions, without double-charging LOP", () => {
    const p = computePayslip(salary(), summary({ lopDays: 6 }));
    // Earned 20,000; PF 12% of prorated basic (9,600) = 1,152; ESI 0 (above
    // ceiling); PT 200. LOP is shown for transparency, already reflected in
    // earned gross, so it is not subtracted again.
    expect(p.deductions.total).toBe(1352);
    expect(p.netPay).toBe(20000 - 1352);
  });
});
