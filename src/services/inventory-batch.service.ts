import InventoryItem from "../models/inventory-item.model";
import { InventoryBatch } from "../models/inventory-batch.model";
import { allocateFefo } from "./fefo-allocation";

/**
 * Email everyone who can act on it (inventory:approve holders — Super
 * Admin/Admin) that an item just crossed below its reorder threshold.
 * Low-stock was previously only visible as a passive dashboard filter — an
 * admin had to think to check Inventory to notice. Lazy-imports so this
 * side effect doesn't add weight to the hot stock-issue path when nothing
 * is actually low. Best-effort: never throws, never blocks the stock
 * movement that triggered it.
 */
const notifyLowStock = async (item: any): Promise<void> => {
  const { sendEmail } = await import("./email.service");
  const { Role, PERMISSIONS } = await import("../models/role.model");
  const { Admin } = await import("../models/admin.model");
  const roles = await Role.find({ permissions: PERMISSIONS.INVENTORY_APPROVE }).select("_id").lean();
  const admins = await Admin.find({
    roleId: { $in: roles.map((r: any) => r._id) },
    isActive: true,
    isDeleted: false,
  })
    .select("email fullName")
    .lean();
  await Promise.all(
    admins
      .filter((a: any) => a.email)
      .map((a: any) =>
        sendEmail({
          to: a.email,
          purpose: "NOTIFICATIONS",
          subject: `Low stock alert: ${item.name}`,
          html:
            `<p><strong>${item.name}</strong> (SKU ${item.sku}) has dropped to ` +
            `<strong>${item.currentStock} ${item.unit}</strong>, at or below its reorder ` +
            `threshold of ${item.reorderThreshold}.</p>` +
            `<p>Please review and reorder from the Inventory Management page.</p>`,
        }),
      ),
  );
};

/**
 * Keep the item's scalar expiryDate/batchNo (read by existing alert queries
 * and any older UI) mirroring its soonest-expiring active batch, so nothing
 * that already reads those fields directly needs to change.
 */
const syncItemExpirySummary = async (item: any) => {
  const soonest = await InventoryBatch.findOne({
    itemId: item._id,
    quantity: { $gt: 0 },
    isDepleted: false,
    expiryDate: { $ne: null },
  })
    .sort({ expiryDate: 1 })
    .lean();
  item.expiryDate = (soonest as any)?.expiryDate || undefined;
  item.batchNo = (soonest as any)?.batchNo || undefined;
};

/**
 * Receive a lot of stock into central inventory: creates (or tops up an
 * existing open) batch and increments the item's running total. This is the
 * single authoritative "central stock increases" path — call it instead of
 * mutating `item.currentStock` directly wherever stock comes in.
 */
export const receiveBatch = async (opts: {
  itemId: any;
  batchNo?: string;
  expiryDate?: Date | string;
  quantity: number;
  unitCost?: number;
  source?: "manual" | "purchase_order" | "opening_stock";
  poNumber?: string;
  performedByAdminId?: any;
}): Promise<{ batch: any; currentStock: number }> => {
  const qty = Math.max(0, Number(opts.quantity) || 0);
  if (!qty) throw new Error("quantity_required");

  const item: any = await InventoryItem.findById(opts.itemId);
  if (!item) throw new Error("item_not_found");

  const expiryDate = opts.expiryDate ? new Date(opts.expiryDate) : undefined;

  // Top up an existing open batch with the same batchNo + expiry instead of
  // fragmenting into duplicates when the same lot is received more than once.
  let batch: any = opts.batchNo
    ? await InventoryBatch.findOne({
        itemId: opts.itemId,
        batchNo: opts.batchNo,
        isDepleted: false,
        expiryDate: expiryDate || null,
      })
    : null;

  if (batch) {
    batch.quantity += qty;
    if (opts.unitCost != null) batch.unitCost = opts.unitCost;
    await batch.save();
  } else {
    batch = await InventoryBatch.create({
      itemId: opts.itemId,
      batchNo: opts.batchNo,
      expiryDate,
      quantity: qty,
      unitCost: opts.unitCost,
      source: opts.source || "manual",
      poNumber: opts.poNumber,
      createdByAdminId: opts.performedByAdminId,
    });
  }

  item.currentStock = (item.currentStock || 0) + qty;
  if (opts.unitCost != null) item.unitCost = opts.unitCost;
  await syncItemExpirySummary(item);
  await item.save();

  return { batch, currentStock: item.currentStock };
};

/**
 * Issue stock out of central inventory, First-Expired-First-Out: draws from
 * the soonest-expiring active batches first, then non-expiring batches
 * (oldest-received first), decrementing the item's running total to match.
 * This is the single authoritative "central stock decreases" path.
 *
 * Items with stock predating batch-tracking (currentStock > 0 but no batch
 * rows yet) still work: whatever isn't covered by a batch is drawn from the
 * item's legacy balance directly, so nothing breaks mid-migration.
 */
export const issueFefo = async (opts: {
  itemId: any;
  quantity: number;
}): Promise<{
  currentStock: number;
  drawn: { batchId: any; batchNo?: string; quantity: number; unitCost?: number }[];
  legacyDrawn: number;
  /** Real ₹ value of what was issued — the actual batch costs drawn, plus
   * the item's current unitCost for any legacy (pre-batch) portion. This is
   * the correct COGS figure, unlike quantity × the item's (possibly stale)
   * scalar unitCost. */
  costOfGoodsIssued: number;
  /** costOfGoodsIssued / requested — for callers that want a per-unit rate. */
  avgUnitCost: number;
}> => {
  const requested = Math.max(0, Number(opts.quantity) || 0);
  if (!requested) throw new Error("quantity_required");

  const item: any = await InventoryItem.findById(opts.itemId);
  if (!item) throw new Error("item_not_found");
  if (requested > (item.currentStock || 0)) {
    throw new Error(`insufficient_stock (have ${item.currentStock || 0}, need ${requested})`);
  }

  const [withExpiry, noExpiry] = await Promise.all([
    InventoryBatch.find({
      itemId: opts.itemId,
      quantity: { $gt: 0 },
      isDepleted: false,
      expiryDate: { $ne: null },
    }).sort({ expiryDate: 1 }),
    InventoryBatch.find({
      itemId: opts.itemId,
      quantity: { $gt: 0 },
      isDepleted: false,
      expiryDate: null,
    }).sort({ receivedAt: 1 }),
  ]);

  // WHICH batches to draw and what they cost is pure arithmetic, unit-tested
  // in services/fefo-allocation (see __tests__/fefo-allocation.test.ts). This
  // function keeps only the IO: applying the decision to the documents.
  const byId = new Map<string, any>();
  for (const doc of [...withExpiry, ...noExpiry]) byId.set(String(doc._id), doc);

  const plan = allocateFefo(
    [...withExpiry, ...noExpiry].map((doc: any) => ({
      batchId: doc._id,
      batchNo: doc.batchNo,
      quantity: doc.quantity,
      unitCost: doc.unitCost,
      expiryDate: doc.expiryDate ?? null,
      receivedAt: doc.receivedAt,
    })),
    requested,
    item.unitCost || 0,
  );

  for (const d of plan.drawn) {
    const doc = byId.get(String(d.batchId));
    if (!doc) continue;
    doc.quantity -= d.quantity;
    if (doc.quantity <= 0) {
      doc.quantity = 0;
      doc.isDepleted = true;
    }
    await doc.save();
  }
  const drawn = plan.drawn.map((d) => ({
    batchId: d.batchId,
    batchNo: d.batchNo,
    quantity: d.quantity,
    unitCost: d.unitCost,
  }));
  const legacyDrawn = plan.legacyDrawn;
  const costOfGoodsIssued = plan.costOfGoodsIssued;

  const previousStock = item.currentStock || 0;
  item.currentStock = Math.max(0, previousStock - requested);
  await syncItemExpirySummary(item);
  await item.save();

  // Fire on the CROSSING event only (was above threshold, now at/below) —
  // not on every subsequent issue once already low, which would spam an
  // email per dispense/issue. This is the single choke point every stock-out
  // path in the app goes through (ward/ambulance issue, EMR dispense,
  // pharmacy-commerce checkout, manual adjust-out), so hooking it here
  // covers all of them without duplicating the check per call site.
  const threshold = item.reorderThreshold || 0;
  if (threshold > 0 && item.currentStock <= threshold && previousStock > threshold) {
    void notifyLowStock(item).catch(() => undefined);
  }

  return {
    currentStock: item.currentStock,
    drawn,
    legacyDrawn,
    costOfGoodsIssued: Math.round(costOfGoodsIssued * 100) / 100,
    avgUnitCost: Math.round((costOfGoodsIssued / requested) * 100) / 100,
  };
};

/**
 * Reverse a prior `issueFefo` draw — restocks the EXACT batches it took from
 * (by id, un-depleting if needed) plus any legacy (pre-batch) portion, and
 * bumps the item's running total back up. Used when something that already
 * drew stock gets cancelled (e.g. a pharmacy order), so the reversal is
 * precise instead of a generic "add N back" that loses which lot it came
 * from.
 */
export const returnFefo = async (opts: {
  itemId: any;
  drawn: { batchId: any; quantity: number }[];
  legacyDrawn?: number;
}): Promise<{ currentStock: number }> => {
  const item: any = await InventoryItem.findById(opts.itemId);
  if (!item) throw new Error("item_not_found");

  let restored = 0;
  for (const d of opts.drawn || []) {
    const qty = Math.max(0, Number(d.quantity) || 0);
    if (!qty) continue;
    await InventoryBatch.updateOne(
      { _id: d.batchId },
      { $inc: { quantity: qty }, $set: { isDepleted: false } },
    );
    restored += qty;
  }
  const legacy = Math.max(0, Number(opts.legacyDrawn) || 0);
  restored += legacy;

  item.currentStock = (item.currentStock || 0) + restored;
  await syncItemExpirySummary(item);
  await item.save();

  return { currentStock: item.currentStock };
};

/** All active (non-depleted) batches of an item, soonest-expiring first. */
export const listBatches = (itemId: any) =>
  InventoryBatch.find({ itemId }).sort({ isDepleted: 1, expiryDate: 1, receivedAt: 1 }).lean();

/**
 * Write off a SPECIFIC batch (expired / damaged / lost) — unlike issueFefo,
 * this targets one exact lot rather than drawing FEFO across all of an
 * item's batches, because a write-off is inherently about a particular
 * physical lot going bad, not routine issuance. Decrements that batch and
 * the item's running total; the caller journals the StockTransaction
 * (tagged isWastage/wastageReason) so it's separately reportable.
 */
export const writeOffBatch = async (opts: {
  batchId: any;
  quantity: number;
}): Promise<{ item: any; batch: any; quantity: number }> => {
  const requested = Math.max(0, Number(opts.quantity) || 0);
  if (!requested) throw new Error("quantity_required");

  const batch: any = await InventoryBatch.findById(opts.batchId);
  if (!batch || batch.isDepleted) throw new Error("batch_not_found");
  if (requested > batch.quantity) {
    throw new Error(`insufficient_stock (batch has ${batch.quantity}, need ${requested})`);
  }

  const item: any = await InventoryItem.findById(batch.itemId);
  if (!item) throw new Error("item_not_found");

  batch.quantity -= requested;
  if (batch.quantity <= 0) {
    batch.quantity = 0;
    batch.isDepleted = true;
  }
  await batch.save();

  item.currentStock = Math.max(0, (item.currentStock || 0) - requested);
  await syncItemExpirySummary(item);
  await item.save();

  return { item, batch, quantity: requested };
};
