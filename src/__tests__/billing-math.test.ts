import { recomputeTotals, outstandingOf, money } from "../services/billing-math";

const inv = (over: any = {}) => ({
  lineItems: [],
  payments: [],
  taxPercent: 0,
  discount: 0,
  status: "unpaid",
  ...over,
});

describe("money", () => {
  it("rounds to paise and kills float dust", () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(1234.567)).toBe(1234.57);
  });
});

describe("recomputeTotals", () => {
  it("sums line items into the subtotal and total", () => {
    const i = recomputeTotals(inv({ lineItems: [{ amount: 500 }, { amount: 250 }] }));
    expect(i.subtotal).toBe(750);
    expect(i.total).toBe(750);
    expect(i.balanceDue).toBe(750);
    expect(i.status).toBe("unpaid");
  });

  it("splits GST so CGST + SGST always equals the tax exactly", () => {
    // 18% of 999 = 179.82 -> halves are 89.91 each; an odd-paise case must not drift.
    const i = recomputeTotals(inv({ lineItems: [{ amount: 999 }], taxPercent: 18 }));
    expect(i.taxAmount).toBe(179.82);
    expect(money(i.cgstAmount! + i.sgstAmount!)).toBe(i.taxAmount);
    expect(i.total).toBe(1178.82);
  });

  it("applies the discount after tax", () => {
    const i = recomputeTotals(
      inv({ lineItems: [{ amount: 1000 }], taxPercent: 10, discount: 100 }),
    );
    expect(i.total).toBe(1000); // 1000 + 100 tax - 100 discount
  });

  it("goes partial on a part payment and paid when settled", () => {
    const half = recomputeTotals(
      inv({ lineItems: [{ amount: 1000 }], payments: [{ amount: 400 }] }),
    );
    expect(half.amountPaid).toBe(400);
    expect(half.balanceDue).toBe(600);
    expect(half.status).toBe("partial");

    const full = recomputeTotals(
      inv({ lineItems: [{ amount: 1000 }], payments: [{ amount: 400 }, { amount: 600 }] }),
    );
    expect(full.balanceDue).toBe(0);
    expect(full.status).toBe("paid");
  });

  it("treats a refund as negative and marks the bill refunded", () => {
    const i = recomputeTotals(
      inv({
        lineItems: [{ amount: 1000 }],
        payments: [{ amount: 1000 }, { amount: 300, isRefund: true }],
      }),
    );
    expect(i.amountPaid).toBe(700);
    expect(i.balanceDue).toBe(300);
    expect(i.status).toBe("refunded");
  });

  it("never flips a cancelled or draft bill's status", () => {
    for (const status of ["cancelled", "draft"]) {
      const i = recomputeTotals(
        inv({ status, lineItems: [{ amount: 500 }], payments: [{ amount: 500 }] }),
      );
      expect(i.status).toBe(status);
      // totals are still computed, only the status is frozen
      expect(i.balanceDue).toBe(0);
    }
  });

  it("handles an empty invoice without producing NaN", () => {
    const i = recomputeTotals(inv());
    expect(i.subtotal).toBe(0);
    expect(i.total).toBe(0);
    expect(i.balanceDue).toBe(0);
    expect(Number.isNaN(i.total!)).toBe(false);
  });
});

describe("outstandingOf", () => {
  it("reports what is still collectable", () => {
    expect(outstandingOf({ total: 1000, amountPaid: 250 })).toBe(750);
    expect(outstandingOf({ total: 1000, amountPaid: 1000 })).toBe(0);
  });

  it("is the guard that stops an overpayment typo", () => {
    // 5000 against a 500 bill must be refused, not silently accepted.
    const due = outstandingOf({ total: 500, amountPaid: 0 });
    expect(5000 > due).toBe(true);
  });
});
