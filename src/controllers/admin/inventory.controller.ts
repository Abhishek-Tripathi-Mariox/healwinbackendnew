import { Request, Response, NextFunction } from "express";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";
import { InventoryBatch } from "../../models/inventory-batch.model";
import { listBatches } from "../../services/inventory-batch.service";
import { submitAdjustmentRequest } from "../../services/inventory-adjustment.service";

/**
 * Doctor Panel / HMS — Inventory CRUD, stock movements and reorder/expiry alerts.
 */

const CATEGORIES = new Set(["consumable", "medicine", "equipment"]);

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const search = ((req.query.search as string) || "").trim();

  const query: any = { isDeleted: false };
  if (req.query.category) query.category = req.query.category;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { sku: rx }];
  }
  // ?lowStock=true → only items at/under reorder threshold.
  if (req.query.lowStock === "true") {
    query.$expr = { $lte: ["$currentStock", "$reorderThreshold"] };
  }

  const [items, total] = await Promise.all([
    InventoryItem.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    InventoryItem.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "item_list";
  return next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const item = await InventoryItem.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  }).lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "item_not_found";
    req.rData = {};
    return next();
  }
  const transactions = await StockTransaction.find({ itemId: item._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  req.rData = { item, transactions };
  req.msg = "item_detail";
  return next();
};

/**
 * GET /admin/inventory/by-sku/:sku — exact SKU lookup, for barcode-scanner
 * input (hardware scanners type the code + Enter, indistinguishable from
 * fast keyboard entry — no camera/library needed on this end).
 */
export const bySku = async (req: Request, _res: Response, next: NextFunction) => {
  const sku = String(req.params.sku || "").trim();
  const item = await InventoryItem.findOne({
    sku: { $regex: `^${sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    isDeleted: false,
  }).lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "item_not_found";
    req.rData = {};
    return next();
  }
  req.rData = { item };
  req.msg = "success";
  return next();
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  if (!b.name || !b.sku || !b.category) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "name, sku and category are required" };
    return next();
  }
  if (!CATEGORIES.has(b.category)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "category must be consumable | medicine | equipment" };
    return next();
  }

  const exists = await InventoryItem.findOne({ sku: b.sku, isDeleted: false });
  if (exists) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "an item with this SKU already exists" };
    return next();
  }

  const item = await InventoryItem.create({
    name: b.name,
    sku: b.sku,
    category: b.category,
    unit: b.unit || "piece",
    currentStock: Number(b.currentStock) || 0,
    reorderThreshold: Number(b.reorderThreshold) || 0,
    unitCost: b.unitCost != null && b.unitCost !== "" ? Number(b.unitCost) : undefined,
    sellingPrice: b.sellingPrice != null && b.sellingPrice !== "" ? Number(b.sellingPrice) : undefined,
    expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
    batchNo: b.batchNo || undefined,
    maintenanceStatus:
      b.category === "equipment"
        ? b.maintenanceStatus || "operational"
        : undefined,
    nextMaintenanceAt: b.nextMaintenanceAt
      ? new Date(b.nextMaintenanceAt)
      : undefined,
    location: b.location || undefined,
    notes: b.notes || undefined,
    createdByAdminId: adminId,
  });

  // Seed the opening balance as an "in" movement when stock is provided.
  if (item.currentStock > 0) {
    await StockTransaction.create({
      itemId: item._id,
      type: "in",
      quantity: item.currentStock,
      balanceAfter: item.currentStock,
      reason: "opening stock",
      performedByAdminId: adminId,
    });
  }

  req.rData = { item };
  req.msg = "item_created";
  return next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const b = req.body || {};
  const item = await InventoryItem.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!item) {
    req.rCode = 5;
    req.msg = "item_not_found";
    req.rData = {};
    return next();
  }

  // currentStock is intentionally NOT settable here — use /adjust so every
  // change is journalled. This endpoint edits descriptive fields only.
  const fields = [
    "name",
    "unit",
    "reorderThreshold",
    "unitCost",
    "sellingPrice",
    "batchNo",
    "maintenanceStatus",
    "location",
    "notes",
    "isActive",
  ];
  for (const f of fields) if (b[f] !== undefined) (item as any)[f] = b[f];
  if (b.expiryDate !== undefined)
    item.expiryDate = b.expiryDate ? new Date(b.expiryDate) : undefined;
  if (b.nextMaintenanceAt !== undefined)
    item.nextMaintenanceAt = b.nextMaintenanceAt
      ? new Date(b.nextMaintenanceAt)
      : undefined;
  if (b.lastServicedAt !== undefined)
    item.lastServicedAt = b.lastServicedAt
      ? new Date(b.lastServicedAt)
      : undefined;

  await item.save();
  req.rData = { item };
  req.msg = "item_updated";
  return next();
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const item = await InventoryItem.findOne({
    _id: (req.params.id as string),
    isDeleted: false,
  });
  if (!item) {
    req.rCode = 5;
    req.msg = "item_not_found";
    req.rData = {};
    return next();
  }
  item.isDeleted = true;
  item.isActive = false;
  await item.save();
  req.rData = {};
  req.msg = "item_deleted";
  return next();
};

/**
 * POST /admin/inventory/:id/adjust — request a stock in/out correction.
 *
 * Maker-checker: this does NOT move stock immediately — it submits an
 * InventoryAdjustmentRequest for a different admin to approve (see
 * inventory-adjustment.controller.ts). On approval, "in" goes through
 * receiveBatch (optionally tagged with a batch number/expiry/cost so it's
 * FEFO-issuable later) and "out" goes through issueFefo (soonest-expiring
 * batch(es) first) — both keep InventoryItem.currentStock authoritative.
 */
export const adjust = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const type = b.type;
  const quantity = Number(b.quantity);

  if (type !== "in" && type !== "out") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "type must be 'in' or 'out'" };
    return next();
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "quantity must be a positive number" };
    return next();
  }

  try {
    const request = await submitAdjustmentRequest({
      itemId: req.params.id as string,
      type: type === "in" ? "adjust_in" : "adjust_out",
      quantity,
      reason: b.reason || undefined,
      batchNo: b.batchNo || undefined,
      expiryDate: b.expiryDate || undefined,
      unitCost: b.unitCost != null && b.unitCost !== "" ? Number(b.unitCost) : undefined,
      requestedByAdminId: adminId,
    });
    req.rData = { request };
    req.msg = "submitted_for_approval";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "adjust_failed";
    req.rData = {};
    return next();
  }
};

/** GET /admin/inventory/:id/batches — every batch (active + depleted) for this item. */
export const batches = async (req: Request, _res: Response, next: NextFunction) => {
  const rows = await listBatches(req.params.id as string);
  req.rData = { batches: rows };
  req.msg = "success";
  return next();
};

/**
 * POST /admin/inventory/:id/batches/:batchId/writeoff — request discarding a
 * specific lot (expired/damaged/lost). Maker-checker: submits for a
 * different admin's approval — the batch isn't touched until then.
 */
export const writeOff = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const quantity = Number(b.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "quantity must be a positive number" };
    return next();
  }

  try {
    const adminId = (req as any).adminId;
    const request = await submitAdjustmentRequest({
      itemId: req.params.id as string,
      batchId: req.params.batchId as string,
      type: "writeoff",
      quantity,
      reason: b.notes || undefined,
      wastageReason: b.reason,
      requestedByAdminId: adminId,
    });
    req.rData = { request };
    req.msg = "submitted_for_approval";
    return next();
  } catch (e: any) {
    req.rCode = 0;
    req.msg = e?.message || "writeoff_failed";
    req.rData = {};
    return next();
  }
};

/** GET /admin/inventory/alerts — low stock + expiring soon. */
export const alerts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const days = Math.max(1, parseInt((req.query.days as string) || "30", 10));
  const horizon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [lowStock, expiringSoon, maintenanceDue, expiringBatches] = await Promise.all([
    InventoryItem.find({
      isDeleted: false,
      isActive: true,
      $expr: { $lte: ["$currentStock", "$reorderThreshold"] },
    })
      .sort({ currentStock: 1 })
      .lean(),
    // Kept for back-compat with existing UI — mirrors each item's SOONEST
    // active batch (see inventory-batch.service#syncItemExpirySummary), so
    // this stays accurate even though expiry now lives at the batch level.
    InventoryItem.find({
      isDeleted: false,
      isActive: true,
      expiryDate: { $ne: null, $lte: horizon },
    })
      .sort({ expiryDate: 1 })
      .lean(),
    InventoryItem.find({
      isDeleted: false,
      isActive: true,
      category: "equipment",
      nextMaintenanceAt: { $ne: null, $lte: horizon },
    })
      .sort({ nextMaintenanceAt: 1 })
      .lean(),
    // Batch-level detail: which specific lot, how many units, expiring when —
    // richer than the item-level summary above.
    InventoryBatch.find({
      isDepleted: false,
      quantity: { $gt: 0 },
      expiryDate: { $ne: null, $lte: horizon },
    })
      .sort({ expiryDate: 1 })
      .populate("itemId", "name sku unit category")
      .limit(200)
      .lean(),
  ]);

  // Wastage written off in the same window, by reason — separately
  // reportable from ordinary consumption (see writeOff()).
  const wastageAgg = await StockTransaction.aggregate([
    { $match: { isWastage: true, createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } } },
    { $group: { _id: "$wastageReason", quantity: { $sum: "$quantity" }, value: { $sum: { $ifNull: ["$amount", 0] } }, count: { $sum: 1 } } },
  ]);
  const wastageByReason = Object.fromEntries(wastageAgg.map((w: any) => [w._id || "other", w.quantity]));
  const wastageTotal = wastageAgg.reduce((s: number, w: any) => s + (w.quantity || 0), 0);
  const wastageValue = Math.round(wastageAgg.reduce((s: number, w: any) => s + (w.value || 0), 0) * 100) / 100;

  req.rData = {
    lowStock,
    expiringSoon,
    maintenanceDue,
    expiringBatches: expiringBatches.map((b: any) => ({
      _id: String(b._id),
      itemId: String(b.itemId?._id || b.itemId),
      itemName: b.itemId?.name || "Item",
      sku: b.itemId?.sku || "",
      unit: b.itemId?.unit || "",
      batchNo: b.batchNo || null,
      quantity: b.quantity,
      expiryDate: b.expiryDate,
    })),
    wastage: { total: wastageTotal, value: wastageValue, byReason: wastageByReason },
    counts: {
      lowStock: lowStock.length,
      expiringSoon: expiringSoon.length,
      maintenanceDue: maintenanceDue.length,
    },
  };
  req.msg = "alerts_list";
  return next();
};

/**
 * GET /admin/inventory/valuation — real stock value, computed from actual
 * batch costs (weighted, per item) instead of quantity × the item's single
 * mutable unitCost — so items whose purchase price changed over time are
 * valued correctly instead of every unit being priced at the latest cost.
 * Legacy stock predating batch-tracking still falls back to the item's
 * scalar unitCost for whatever portion isn't covered by a batch.
 */
export const valuation = async (req: Request, _res: Response, next: NextFunction) => {
  const [items, batchAgg] = await Promise.all([
    InventoryItem.find({ isDeleted: false, isActive: true })
      .select("name sku category unit currentStock unitCost")
      .lean(),
    InventoryBatch.aggregate([
      { $match: { isDepleted: false, quantity: { $gt: 0 } } },
      {
        $group: {
          _id: "$itemId",
          batchQty: { $sum: "$quantity" },
          batchValue: { $sum: { $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }] } },
        },
      },
    ]),
  ]);

  const batchMap = new Map(batchAgg.map((b: any) => [String(b._id), b]));
  const byCategory: Record<string, { qty: number; value: number }> = {};
  let totalValue = 0;

  const rows = items.map((it: any) => {
    const b: any = batchMap.get(String(it._id));
    const batchQty = b?.batchQty || 0;
    const batchValue = b?.batchValue || 0;
    // Whatever current stock isn't covered by an active batch predates
    // batch-tracking — value it at the item's scalar unitCost.
    const legacyQty = Math.max(0, (it.currentStock || 0) - batchQty);
    const legacyValue = legacyQty * (it.unitCost || 0);
    const value = batchValue + legacyValue;
    const avgCost = it.currentStock > 0 ? value / it.currentStock : it.unitCost || 0;

    totalValue += value;
    if (!byCategory[it.category]) byCategory[it.category] = { qty: 0, value: 0 };
    byCategory[it.category].qty += it.currentStock || 0;
    byCategory[it.category].value += value;

    return {
      itemId: String(it._id),
      name: it.name,
      sku: it.sku,
      category: it.category,
      unit: it.unit,
      currentStock: it.currentStock || 0,
      avgCost: Math.round(avgCost * 100) / 100,
      value: Math.round(value * 100) / 100,
    };
  });
  rows.sort((a, b) => b.value - a.value);

  req.rData = {
    totalValue: Math.round(totalValue * 100) / 100,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, { qty: v.qty, value: Math.round(v.value * 100) / 100 }]),
    ),
    items: rows,
  };
  req.msg = "success";
  return next();
};

/**
 * GET /admin/inventory/consumption-report?days=30 — daily consumption trend
 * + top-consumed items, split into ordinary issuance vs wastage (see
 * writeOff()) so a spike is traceable to actual use vs stock going bad.
 */
export const consumptionReport = async (req: Request, _res: Response, next: NextFunction) => {
  const days = Math.max(1, Math.min(365, parseInt((req.query.days as string) || "30", 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [daily, topItems] = await Promise.all([
    StockTransaction.aggregate([
      { $match: { type: "out", createdAt: { $gte: since } } },
      {
        $group: {
          _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, wastage: "$isWastage" },
          quantity: { $sum: "$quantity" },
          value: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]),
    StockTransaction.aggregate([
      { $match: { type: "out", createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$itemId",
          quantity: { $sum: "$quantity" },
          value: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
      { $sort: { value: -1 } },
      { $limit: 15 },
      { $lookup: { from: "inventoryitems", localField: "_id", foreignField: "_id", as: "item" } },
    ]),
  ]);

  // Fold the wastage/non-wastage split into one row per date.
  const byDate = new Map<string, { date: string; quantity: number; value: number; wastageQuantity: number; wastageValue: number }>();
  for (const row of daily) {
    const date = row._id.date;
    if (!byDate.has(date)) byDate.set(date, { date, quantity: 0, value: 0, wastageQuantity: 0, wastageValue: 0 });
    const bucket = byDate.get(date)!;
    if (row._id.wastage) {
      bucket.wastageQuantity += row.quantity;
      bucket.wastageValue += row.value;
    } else {
      bucket.quantity += row.quantity;
      bucket.value += row.value;
    }
  }

  req.rData = {
    days,
    series: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topItems: topItems.map((r: any) => ({
      itemId: String(r._id),
      name: r.item?.[0]?.name || "Item",
      sku: r.item?.[0]?.sku || "",
      unit: r.item?.[0]?.unit || "",
      quantity: r.quantity,
      value: Math.round(r.value * 100) / 100,
    })),
  };
  req.msg = "success";
  return next();
};

const AGE_BUCKETS = [
  { label: "0-30 days", max: 30 },
  { label: "31-60 days", max: 60 },
  { label: "61-90 days", max: 90 },
  { label: "90+ days", max: Infinity },
];

/**
 * GET /admin/inventory/aging-report — how long active batches have sat in
 * stock since receipt, bucketed — surfaces slow-moving stock that's at risk
 * of expiring/going obsolete before it's ever used, and the oldest lots
 * specifically so FEFO discipline can be checked.
 */
export const agingReport = async (req: Request, _res: Response, next: NextFunction) => {
  const activeBatches = await InventoryBatch.find({ isDepleted: false, quantity: { $gt: 0 } })
    .populate("itemId", "name sku unit")
    .lean();

  const now = Date.now();
  const buckets = AGE_BUCKETS.map((b) => ({ label: b.label, qty: 0, value: 0, count: 0 }));
  const withAge = activeBatches.map((b: any) => {
    const ageDays = Math.floor((now - new Date(b.receivedAt).getTime()) / (24 * 60 * 60 * 1000));
    const value = b.quantity * (b.unitCost || 0);
    const bucketIndex = AGE_BUCKETS.findIndex((bk) => ageDays <= bk.max);
    const bucket = buckets[bucketIndex === -1 ? buckets.length - 1 : bucketIndex];
    bucket.qty += b.quantity;
    bucket.value += value;
    bucket.count += 1;
    return {
      batchId: String(b._id),
      itemId: String(b.itemId?._id || b.itemId),
      itemName: b.itemId?.name || "Item",
      sku: b.itemId?.sku || "",
      unit: b.itemId?.unit || "",
      batchNo: b.batchNo || null,
      quantity: b.quantity,
      value: Math.round(value * 100) / 100,
      receivedAt: b.receivedAt,
      expiryDate: b.expiryDate || null,
      ageDays,
    };
  });
  withAge.sort((a, b) => b.ageDays - a.ageDays);

  req.rData = {
    buckets: buckets.map((b) => ({ ...b, value: Math.round(b.value * 100) / 100 })),
    oldest: withAge.slice(0, 20),
  };
  req.msg = "success";
  return next();
};
