import { allocateFefo, fefoOrder } from "../services/fefo-allocation";

const b = (over: any) => ({ batchId: over.batchNo, quantity: 0, ...over });

describe("fefoOrder", () => {
  it("puts the soonest expiry first", () => {
    const order = fefoOrder([
      b({ batchNo: "LATE", quantity: 10, expiryDate: new Date("2027-01-01") }),
      b({ batchNo: "SOON", quantity: 10, expiryDate: new Date("2026-06-01") }),
    ]);
    expect(order.map((x) => x.batchNo)).toEqual(["SOON", "LATE"]);
  });

  it("consumes undated batches last, oldest received first", () => {
    const order = fefoOrder([
      b({ batchNo: "NEW-UNDATED", quantity: 5, receivedAt: new Date("2026-05-01") }),
      b({ batchNo: "DATED", quantity: 5, expiryDate: new Date("2030-01-01") }),
      b({ batchNo: "OLD-UNDATED", quantity: 5, receivedAt: new Date("2025-01-01") }),
    ]);
    expect(order.map((x) => x.batchNo)).toEqual(["DATED", "OLD-UNDATED", "NEW-UNDATED"]);
  });
});

describe("allocateFefo", () => {
  it("draws entirely from the nearest-expiry batch when it covers the request", () => {
    const r = allocateFefo(
      [
        b({ batchNo: "SOON", quantity: 50, unitCost: 10, expiryDate: new Date("2026-06-01") }),
        b({ batchNo: "LATE", quantity: 50, unitCost: 12, expiryDate: new Date("2027-01-01") }),
      ],
      20,
    );
    expect(r.drawn).toHaveLength(1);
    expect(r.drawn[0].batchNo).toBe("SOON");
    expect(r.drawn[0].quantity).toBe(20);
    expect(r.costOfGoodsIssued).toBe(200);
    expect(r.legacyDrawn).toBe(0);
  });

  it("spills into the next batch and costs each at its own rate", () => {
    const r = allocateFefo(
      [
        b({ batchNo: "SOON", quantity: 30, unitCost: 10, expiryDate: new Date("2026-06-01") }),
        b({ batchNo: "LATE", quantity: 50, unitCost: 12, expiryDate: new Date("2027-01-01") }),
      ],
      40,
    );
    expect(r.drawn.map((d) => [d.batchNo, d.quantity])).toEqual([
      ["SOON", 30],
      ["LATE", 10],
    ]);
    // 30x10 + 10x12 — NOT 40 x either rate. This is the COGS bug guard.
    expect(r.costOfGoodsIssued).toBe(420);
  });

  it("reports a shortfall as legacy stock rather than over-drawing", () => {
    const r = allocateFefo(
      [b({ batchNo: "ONLY", quantity: 5, unitCost: 10, expiryDate: new Date("2026-06-01") })],
      12,
      8, // item-level cost for the uncovered remainder
    );
    expect(r.drawn[0].quantity).toBe(5);
    expect(r.legacyDrawn).toBe(7);
    expect(r.costOfGoodsIssued).toBe(5 * 10 + 7 * 8);
  });

  it("skips depleted batches", () => {
    const r = allocateFefo(
      [
        b({ batchNo: "EMPTY", quantity: 0, unitCost: 10, expiryDate: new Date("2026-01-01") }),
        b({ batchNo: "STOCKED", quantity: 10, unitCost: 10, expiryDate: new Date("2026-06-01") }),
      ],
      5,
    );
    expect(r.drawn).toHaveLength(1);
    expect(r.drawn[0].batchNo).toBe("STOCKED");
  });

  it("draws nothing for a zero request", () => {
    const r = allocateFefo([b({ batchNo: "A", quantity: 10, unitCost: 5 })], 0);
    expect(r.drawn).toHaveLength(0);
    expect(r.costOfGoodsIssued).toBe(0);
  });
});
