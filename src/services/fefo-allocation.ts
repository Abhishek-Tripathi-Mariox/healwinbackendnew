/**
 * Pure FEFO (First-Expired-First-Out) allocation.
 *
 * Extracted from inventory-batch.service so the rule that decides WHICH stock
 * leaves the shelf — and what it cost — can be tested without a database. The
 * service still owns the IO (loading batches, persisting the decrement); this
 * owns the arithmetic.
 */

export interface AllocatableBatch {
  batchId: unknown;
  batchNo?: string;
  quantity: number;
  unitCost?: number;
  /** null/undefined = no expiry on file; those are consumed last. */
  expiryDate?: Date | null;
  receivedAt?: Date;
}

export interface Allocation {
  drawn: { batchId: unknown; batchNo?: string; quantity: number; unitCost?: number }[];
  /** Requested units no batch could cover — pre-batch-tracking stock. */
  legacyDrawn: number;
  /** Real cost of what was issued (batch costs + legacy at the item's cost). */
  costOfGoodsIssued: number;
}

/**
 * Order batches the way stock must be consumed: soonest expiry first, then
 * anything without an expiry date oldest-received first.
 */
export const fefoOrder = (batches: AllocatableBatch[]): AllocatableBatch[] => {
  const dated = batches
    .filter((b) => b.expiryDate != null)
    .sort((a, b) => +new Date(a.expiryDate!) - +new Date(b.expiryDate!));
  const undated = batches
    .filter((b) => b.expiryDate == null)
    .sort((a, b) => +new Date(a.receivedAt || 0) - +new Date(b.receivedAt || 0));
  return [...dated, ...undated];
};

/**
 * Draw `requested` units across batches in FEFO order.
 *
 * Never throws on short stock — it reports the shortfall as `legacyDrawn` so
 * the caller decides (the service refuses up front by comparing against the
 * item's currentStock; older pre-batch stock legitimately has no batch row).
 */
export const allocateFefo = (
  batches: AllocatableBatch[],
  requested: number,
  itemUnitCost = 0,
): Allocation => {
  let remaining = Math.max(0, requested);
  let costOfGoodsIssued = 0;
  const drawn: Allocation["drawn"] = [];

  for (const batch of fefoOrder(batches)) {
    if (remaining <= 0) break;
    if (batch.quantity <= 0) continue;
    const take = Math.min(batch.quantity, remaining);
    drawn.push({
      batchId: batch.batchId,
      batchNo: batch.batchNo,
      quantity: take,
      unitCost: batch.unitCost,
    });
    costOfGoodsIssued += take * (batch.unitCost || 0);
    remaining -= take;
  }

  costOfGoodsIssued += remaining * (itemUnitCost || 0);
  return {
    drawn,
    legacyDrawn: remaining,
    costOfGoodsIssued: Math.round(costOfGoodsIssued * 100) / 100,
  };
};
