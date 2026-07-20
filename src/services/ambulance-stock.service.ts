import { Types } from "mongoose";
import InventoryItem from "../models/inventory-item.model";
import StockTransaction from "../models/stock-transaction.model";
import Ambulance from "../models/ambulance.model";
import Shift from "../models/shift.model";
import {
  AmbulanceStock,
  AmbulanceStockTransaction,
} from "../models/ambulance-stock.model";

/**
 * Which ambulance is this crew member on?
 *
 * Staff are assigned FROM the ambulance side, but `Ambulance.assignedDriverId /
 * assignedAttendantId` are only a CACHE of the currently-ACTIVE shift — the
 * shift state machine clears them when a shift ends. So when the crew is
 * off-shift those fields are empty. We therefore fall back to the staff's
 * active (then most recent) shift, which carries the real ambulanceId.
 */
export const resolveCrewAmbulanceId = async (staffId: any): Promise<any> => {
  if (!staffId) return undefined;

  const amb: any = await Ambulance.findOne({
    isActive: { $ne: false },
    $or: [{ assignedDriverId: staffId }, { assignedAttendantId: staffId }],
  })
    .select("_id")
    .lean();
  if (amb?._id) return amb._id;

  const active: any = await Shift.findOne({
    staffId,
    status: "active",
    ambulanceId: { $ne: null },
  })
    .sort({ startAt: -1 })
    .select("ambulanceId")
    .lean();
  if (active?.ambulanceId) return active.ambulanceId;

  const recent: any = await Shift.findOne({ staffId, ambulanceId: { $ne: null } })
    .sort({ startAt: -1 })
    .select("ambulanceId")
    .lean();
  return recent?.ambulanceId ?? undefined;
};

/**
 * Ambulance inventory movements — the single place stock is added to or removed
 * from an ambulance, keeping the on-hand `AmbulanceStock`, the ambulance journal
 * (`AmbulanceStockTransaction`) and the central `InventoryItem`/`StockTransaction`
 * in sync.
 */

type Line = { itemId?: any; name?: string; qty: number };

/**
 * Restock an ambulance from central inventory (a fulfilled crew stock request):
 * central InventoryItem decreases, the ambulance's on-hand increases, both
 * journals get an entry. Lines without a resolvable itemId are skipped.
 */
export const restockAmbulance = async (opts: {
  ambulanceId: any;
  staffId?: any;
  stockRequestId?: any;
  /** Admin performing the fulfilment — required on the central StockTransaction. */
  performedByAdminId?: any;
  items: Line[];
}): Promise<{ moved: number; skipped: string[] }> => {
  const skipped: string[] = [];
  let moved = 0;

  for (const line of opts.items) {
    const qty = Math.max(0, Number(line.qty) || 0);
    if (!qty) continue;
    // Resolve the item by id, else by (case-insensitive) name.
    const item: any = line.itemId
      ? await InventoryItem.findById(line.itemId)
      : line.name
        ? await InventoryItem.findOne({
            name: new RegExp(`^${String(line.name).trim()}$`, "i"),
            isDeleted: { $ne: true },
          })
        : null;
    if (!item) {
      skipped.push(line.name || String(line.itemId || "unknown"));
      continue;
    }

    // Central inventory out.
    const newCentral = Math.max(0, (item.currentStock || 0) - qty);
    item.currentStock = newCentral;
    await item.save();
    await StockTransaction.create({
      itemId: item._id,
      type: "out",
      quantity: qty,
      balanceAfter: newCentral,
      reason: "Loaded onto ambulance",
      issuedToType: "other",
      performedByAdminId: opts.performedByAdminId,
    });

    // Ambulance on-hand in.
    const stock: any = await AmbulanceStock.findOneAndUpdate(
      { ambulanceId: opts.ambulanceId, itemId: item._id },
      { $inc: { quantity: qty } },
      { new: true, upsert: true },
    );
    await AmbulanceStockTransaction.create({
      ambulanceId: opts.ambulanceId,
      itemId: item._id,
      itemName: item.name,
      type: "in",
      quantity: qty,
      balanceAfter: stock.quantity,
      unitCost: item.unitCost,
      sellingPrice: item.sellingPrice,
      reason: "restock",
      staffId: opts.staffId,
      stockRequestId: opts.stockRequestId,
    });
    moved += 1;
  }
  return { moved, skipped };
};

export type ConsumedLine = {
  itemId: any;
  itemName: string;
  qty: number;
  rate: number; // sellingPrice
  amount: number; // qty * rate
};

/**
 * Consume items off an ambulance onto a patient during a dispatch. Decrements
 * the ambulance on-hand, journals each "out" with the patient/dispatch link +
 * billed amount, and returns the priced lines so the caller can add them to the
 * patient's in-transit bill. Won't let on-hand go negative.
 */
export const consumeFromAmbulance = async (opts: {
  ambulanceId: any;
  staffId?: any;
  requestId?: any;
  dispatchId?: any;
  patientId?: any;
  patientName?: string;
  items: Line[];
}): Promise<{ lines: ConsumedLine[]; total: number; shortages: string[] }> => {
  const lines: ConsumedLine[] = [];
  const shortages: string[] = [];
  let total = 0;

  for (const line of opts.items) {
    const qty = Math.max(0, Number(line.qty) || 0);
    if (!qty || !line.itemId) continue;
    const item: any = await InventoryItem.findById(line.itemId).lean();
    if (!item) continue;

    const stock: any = await AmbulanceStock.findOne({
      ambulanceId: opts.ambulanceId,
      itemId: line.itemId,
    });
    const onHand = stock?.quantity || 0;
    if (onHand < qty) {
      shortages.push(`${item.name} (have ${onHand}, need ${qty})`);
      // Consume only what's available so the record stays truthful.
      if (onHand <= 0) continue;
    }
    const take = Math.min(qty, onHand);
    const balanceAfter = onHand - take;
    if (stock) {
      stock.quantity = balanceAfter;
      await stock.save();
    }

    const rate = Number(item.sellingPrice || 0);
    const amount = take * rate;
    total += amount;
    lines.push({ itemId: item._id, itemName: item.name, qty: take, rate, amount });

    await AmbulanceStockTransaction.create({
      ambulanceId: opts.ambulanceId,
      itemId: item._id,
      itemName: item.name,
      type: "out",
      quantity: take,
      balanceAfter,
      unitCost: item.unitCost,
      sellingPrice: rate,
      amount,
      reason: "consumption",
      staffId: opts.staffId,
      requestId: opts.requestId,
      dispatchId: opts.dispatchId,
      patientId: opts.patientId,
      patientName: opts.patientName,
    });
  }
  return { lines, total, shortages };
};
