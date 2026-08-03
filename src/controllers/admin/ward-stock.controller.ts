import { Request, Response, NextFunction } from "express";
import Ward from "../../models/ward.model";
import InventoryItem from "../../models/inventory-item.model";
import { WardStock, WardStockTransaction } from "../../models/ward-stock.model";
import { issueToWard, adjustWardStock, transferBetweenWards } from "../../services/ward-stock.service";

/**
 * GET /admin/ward-stock — every ward's on-hand summary + consumption spend.
 * Mirrors admin/controllers/ambulance-stock.controller.ts#reports.
 */
export const reports = async (req: Request, _res: Response, next: NextFunction) => {
  const [consumedAgg, onHandAgg, wards] = await Promise.all([
    WardStockTransaction.aggregate([
      { $match: { type: "out" } },
      {
        $group: {
          _id: "$wardId",
          consumedQty: { $sum: "$quantity" },
        },
      },
    ]),
    WardStock.aggregate([
      { $match: { quantity: { $gt: 0 } } },
      { $group: { _id: "$wardId", lines: { $sum: 1 }, qty: { $sum: "$quantity" } } },
    ]),
    Ward.find({ isActive: { $ne: false } }).select("name").lean(),
  ]);

  const consumedMap = new Map(consumedAgg.map((c: any) => [String(c._id), c]));
  const onHandMap = new Map(onHandAgg.map((o: any) => [String(o._id), o]));

  const byWard = wards.map((w: any) => {
    const id = String(w._id);
    const c: any = consumedMap.get(id);
    const o: any = onHandMap.get(id);
    return {
      wardId: id,
      name: w.name,
      onHandLines: o?.lines || 0,
      onHandQty: o?.qty || 0,
      consumedQty: c?.consumedQty || 0,
    };
  });

  req.rData = { byWard };
  req.msg = "success";
  return next();
};

/** GET /admin/ward-stock/:wardId — on-hand stock + recent movements for one ward. */
export const wardStock = async (req: Request, _res: Response, next: NextFunction) => {
  const wardId = req.params.wardId as string;
  const [ward, rows, recent] = await Promise.all([
    Ward.findById(wardId).select("name").lean(),
    WardStock.find({ wardId })
      .populate("itemId", "name unit category sellingPrice unitCost currentStock")
      .sort({ quantity: -1 })
      .lean(),
    WardStockTransaction.find({ wardId })
      .populate("transferWardId", "name")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const items = rows.map((r: any) => {
    const it = r.itemId || {};
    return {
      itemId: String(it._id || r.itemId),
      name: it.name || "Item",
      unit: it.unit || "",
      category: it.category || "",
      quantity: r.quantity,
      centralStock: it.currentStock ?? null,
    };
  });

  req.rData = {
    ward: ward ? { _id: String((ward as any)._id), name: (ward as any).name } : null,
    items,
    recent: recent.map((t: any) => ({
      _id: String(t._id),
      itemName: t.itemName,
      type: t.type,
      quantity: t.quantity,
      balanceAfter: t.balanceAfter,
      reason: t.reason,
      transferWardName: t.transferWardId?.name ?? null,
      notes: t.notes ?? null,
      at: t.createdAt,
    })),
  };
  req.msg = "success";
  return next();
};

/** GET /admin/ward-stock/catalog/items — active central items, for the issue-stock picker. */
export const catalogItems = async (req: Request, _res: Response, next: NextFunction) => {
  const q = String(req.query.q || "").trim();
  const filter: any = { isActive: true, isDeleted: { $ne: true } };
  if (q) filter.$text = { $search: q };
  const items = await InventoryItem.find(filter)
    .select("name unit category currentStock unitCost sellingPrice")
    .sort({ name: 1 })
    .limit(100)
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

/** POST /admin/ward-stock/:wardId/issue — issue stock from central inventory to this ward. */
export const issue = async (req: Request, _res: Response, next: NextFunction) => {
  const wardId = req.params.wardId as string;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "items[] required" };
    return next();
  }
  try {
    const adminId = (req as any).adminId;
    const result = await issueToWard({ wardId, performedByAdminId: adminId, items });
    req.rData = result;
    req.msg = result.skipped.length ? "issued_with_skips" : "issued";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "issue_failed";
    req.rData = {};
    return next();
  }
};

/** POST /admin/ward-stock/:wardId/adjust — log consumption/wastage/correction at the ward. */
export const adjust = async (req: Request, _res: Response, next: NextFunction) => {
  const wardId = req.params.wardId as string;
  const { itemId, quantity, direction, reason, notes } = req.body || {};
  if (!itemId || !quantity || !["in", "out"].includes(direction)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "itemId, quantity, direction ('in'|'out') required" };
    return next();
  }
  try {
    const adminId = (req as any).adminId;
    const result = await adjustWardStock({
      wardId,
      itemId,
      quantity: Number(quantity),
      direction,
      reason: reason === "adjustment" ? "adjustment" : "consumption",
      notes,
      performedByAdminId: adminId,
    });
    req.rData = result;
    req.msg = "adjusted";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "adjust_failed";
    req.rData = {};
    return next();
  }
};

/** POST /admin/ward-stock/:wardId/transfer — move stock from this ward to another, directly. */
export const transfer = async (req: Request, _res: Response, next: NextFunction) => {
  const fromWardId = req.params.wardId as string;
  const { toWardId, itemId, quantity, notes } = req.body || {};
  if (!toWardId || !itemId || !quantity) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "toWardId, itemId, quantity required" };
    return next();
  }
  try {
    const adminId = (req as any).adminId;
    const result = await transferBetweenWards({
      fromWardId,
      toWardId,
      itemId,
      quantity: Number(quantity),
      notes,
      performedByAdminId: adminId,
    });
    req.rData = result;
    req.msg = "transferred";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "transfer_failed";
    req.rData = {};
    return next();
  }
};
