import InventoryItem from "../models/inventory-item.model";
import StockTransaction from "../models/stock-transaction.model";
import Ward from "../models/ward.model";
import { WardStock, WardStockTransaction } from "../models/ward-stock.model";
import { issueFefo } from "./inventory-batch.service";

type Line = { itemId: any; qty: number };

/**
 * Issue stock from central inventory to a ward: central InventoryItem
 * decreases, the ward's on-hand increases, both journals get an entry.
 * Mirrors ambulance-stock.service.ts#restockAmbulance.
 */
export const issueToWard = async (opts: {
  wardId: any;
  performedByAdminId?: any;
  items: Line[];
}): Promise<{ moved: number; skipped: string[] }> => {
  const skipped: string[] = [];
  let moved = 0;

  const ward: any = await Ward.findById(opts.wardId).select("name").lean();
  if (!ward) throw new Error("ward_not_found");

  for (const line of opts.items) {
    const qty = Math.max(0, Number(line.qty) || 0);
    if (!qty || !line.itemId) continue;
    const item: any = await InventoryItem.findById(line.itemId);
    if (!item) {
      skipped.push(String(line.itemId));
      continue;
    }
    if ((item.currentStock || 0) < qty) {
      skipped.push(`${item.name} (only ${item.currentStock || 0} in central stock)`);
      continue;
    }

    // Central inventory out — FEFO: draws the soonest-expiring batch(es)
    // first, and gives back their REAL cost (not the item's possibly-stale
    // scalar unitCost).
    const { currentStock: newCentral, costOfGoodsIssued, avgUnitCost } = await issueFefo({
      itemId: item._id,
      quantity: qty,
    });
    await StockTransaction.create({
      itemId: item._id,
      type: "out",
      quantity: qty,
      balanceAfter: newCentral,
      amount: costOfGoodsIssued,
      reason: "Issued to ward",
      issuedToType: "ward",
      issuedToRef: ward.name,
      performedByAdminId: opts.performedByAdminId,
    });

    // Ward on-hand in.
    const stock: any = await WardStock.findOneAndUpdate(
      { wardId: opts.wardId, itemId: item._id },
      { $inc: { quantity: qty } },
      { new: true, upsert: true },
    );
    await WardStockTransaction.create({
      wardId: opts.wardId,
      itemId: item._id,
      itemName: item.name,
      type: "in",
      quantity: qty,
      balanceAfter: stock.quantity,
      unitCost: avgUnitCost || item.unitCost,
      sellingPrice: item.sellingPrice,
      reason: "restock",
      performedByAdminId: opts.performedByAdminId,
    });
    moved += 1;
  }
  return { moved, skipped };
};

/**
 * Log consumption/wastage or a manual correction directly against a ward's
 * already-issued stock. Does NOT touch central inventory — that stock left
 * the central pool when it was issued to the ward.
 */
export const adjustWardStock = async (opts: {
  wardId: any;
  itemId: any;
  quantity: number;
  direction: "in" | "out";
  reason: "consumption" | "adjustment";
  notes?: string;
  performedByAdminId?: any;
}): Promise<{ balanceAfter: number }> => {
  const qty = Math.max(0, Number(opts.quantity) || 0);
  if (!qty) throw new Error("quantity_required");

  const item: any = await InventoryItem.findById(opts.itemId).select("name unitCost sellingPrice").lean();
  if (!item) throw new Error("item_not_found");

  const stock: any = await WardStock.findOne({ wardId: opts.wardId, itemId: opts.itemId });
  const onHand = stock?.quantity || 0;
  const balanceAfter = opts.direction === "in" ? onHand + qty : Math.max(0, onHand - qty);
  const applied = opts.direction === "in" ? qty : onHand - balanceAfter;

  if (stock) {
    stock.quantity = balanceAfter;
    await stock.save();
  } else if (opts.direction === "in") {
    await WardStock.create({ wardId: opts.wardId, itemId: opts.itemId, quantity: balanceAfter });
  }

  await WardStockTransaction.create({
    wardId: opts.wardId,
    itemId: opts.itemId,
    itemName: item.name,
    type: opts.direction,
    quantity: applied,
    balanceAfter,
    unitCost: item.unitCost,
    sellingPrice: item.sellingPrice,
    reason: opts.reason,
    notes: opts.notes,
    performedByAdminId: opts.performedByAdminId,
  });

  return { balanceAfter };
};

/**
 * Move already-issued stock directly from one ward to another, without
 * routing back through central inventory. Journals both sides with
 * reason "transfer" and `transferWardId` pointing at the other ward, so
 * each ward's history reads "transferred to/from X" rather than an opaque
 * out/in.
 */
export const transferBetweenWards = async (opts: {
  fromWardId: any;
  toWardId: any;
  itemId: any;
  quantity: number;
  notes?: string;
  performedByAdminId?: any;
}): Promise<{ balanceAfter: number }> => {
  const qty = Math.max(0, Number(opts.quantity) || 0);
  if (!qty) throw new Error("quantity_required");
  if (String(opts.fromWardId) === String(opts.toWardId)) {
    throw new Error("source_and_destination_must_differ");
  }

  const [item, fromWard, toWard, fromStock] = await Promise.all([
    InventoryItem.findById(opts.itemId).select("name unitCost sellingPrice").lean(),
    Ward.findById(opts.fromWardId).select("name").lean(),
    Ward.findById(opts.toWardId).select("name").lean(),
    WardStock.findOne({ wardId: opts.fromWardId, itemId: opts.itemId }),
  ]);
  if (!item) throw new Error("item_not_found");
  if (!fromWard || !toWard) throw new Error("ward_not_found");

  const onHand = (fromStock as any)?.quantity || 0;
  if (onHand < qty) {
    throw new Error(`insufficient_stock (have ${onHand}, need ${qty})`);
  }

  // Source ward out.
  const fromBalance = onHand - qty;
  (fromStock as any).quantity = fromBalance;
  await (fromStock as any).save();
  await WardStockTransaction.create({
    wardId: opts.fromWardId,
    itemId: item._id,
    itemName: (item as any).name,
    type: "out",
    quantity: qty,
    balanceAfter: fromBalance,
    unitCost: (item as any).unitCost,
    sellingPrice: (item as any).sellingPrice,
    reason: "transfer",
    transferWardId: opts.toWardId,
    notes: opts.notes,
    performedByAdminId: opts.performedByAdminId,
  });

  // Destination ward in.
  const toStock: any = await WardStock.findOneAndUpdate(
    { wardId: opts.toWardId, itemId: item._id },
    { $inc: { quantity: qty } },
    { new: true, upsert: true },
  );
  await WardStockTransaction.create({
    wardId: opts.toWardId,
    itemId: item._id,
    itemName: (item as any).name,
    type: "in",
    quantity: qty,
    balanceAfter: toStock.quantity,
    unitCost: (item as any).unitCost,
    sellingPrice: (item as any).sellingPrice,
    reason: "transfer",
    transferWardId: opts.fromWardId,
    notes: opts.notes,
    performedByAdminId: opts.performedByAdminId,
  });

  return { balanceAfter: fromBalance };
};
