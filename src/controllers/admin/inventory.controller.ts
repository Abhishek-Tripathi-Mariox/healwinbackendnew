import { Request, Response, NextFunction } from "express";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";

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

/** POST /admin/inventory/:id/adjust — stock in/out, journalled. */
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

  if (type === "out" && quantity > item.currentStock) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `cannot issue ${quantity}; only ${item.currentStock} ${item.unit} in stock`,
    };
    return next();
  }

  item.currentStock += type === "in" ? quantity : -quantity;
  await item.save();

  const txn = await StockTransaction.create({
    itemId: item._id,
    type,
    quantity,
    balanceAfter: item.currentStock,
    reason: b.reason || undefined,
    issuedToType: b.issuedToType || undefined,
    issuedToRef: b.issuedToRef || undefined,
    performedByAdminId: adminId,
  });

  req.rData = { item, transaction: txn };
  req.msg = "stock_adjusted";
  return next();
};

/** GET /admin/inventory/alerts — low stock + expiring soon. */
export const alerts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const days = Math.max(1, parseInt((req.query.days as string) || "30", 10));
  const horizon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [lowStock, expiringSoon, maintenanceDue] = await Promise.all([
    InventoryItem.find({
      isDeleted: false,
      isActive: true,
      $expr: { $lte: ["$currentStock", "$reorderThreshold"] },
    })
      .sort({ currentStock: 1 })
      .lean(),
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
  ]);

  req.rData = {
    lowStock,
    expiringSoon,
    maintenanceDue,
    counts: {
      lowStock: lowStock.length,
      expiringSoon: expiringSoon.length,
      maintenanceDue: maintenanceDue.length,
    },
  };
  req.msg = "alerts_list";
  return next();
};
