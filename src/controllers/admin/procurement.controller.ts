import { Request, Response, NextFunction } from "express";
import { Supplier, PurchaseOrder } from "../../models/procurement.model";
import { nextSequence } from "../../models/counter.model";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";
import { receiveBatch } from "../../services/inventory-batch.service";

/** Admin: suppliers + purchase orders (received = GRN). */

// ===== Suppliers =====
export const listSuppliers = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await Supplier.find({ isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
  req.rData = { items }; req.msg = "success"; return next();
};
export const createSupplier = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.name) { req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "name required" }; return next(); }
  const item = await Supplier.create({
    name: b.name, contactPerson: b.contactPerson, phone: b.phone, email: b.email, gstin: b.gstin, address: b.address,
  });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updateSupplier = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await Supplier.findByIdAndUpdate(
    req.params.id as string,
    { $set: { name: b.name, contactPerson: b.contactPerson, phone: b.phone, email: b.email, gstin: b.gstin, address: b.address, isActive: b.isActive } },
    { new: true },
  );
  if (!item) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  req.rData = { item }; req.msg = "updated"; return next();
};
export const deleteSupplier = async (req: Request, _res: Response, next: NextFunction) => {
  await Supplier.findByIdAndUpdate(req.params.id as string, { isDeleted: true, isActive: false });
  req.rData = {}; req.msg = "deleted"; return next();
};

/**
 * GET /admin/procurement/suppliers/:id/performance — derived entirely from
 * this supplier's PurchaseOrders (no new model): order volume/spend,
 * on-time delivery rate (receivedDate vs expectedDate), and a per-item price
 * history so a creeping price on the same SKU is visible over time.
 */
export const supplierPerformance = async (req: Request, _res: Response, next: NextFunction) => {
  const supplierId = req.params.id as string;
  const supplier = await Supplier.findById(supplierId).select("name").lean();
  if (!supplier) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }

  const orders = await PurchaseOrder.find({ supplierId }).sort({ createdAt: -1 }).lean();

  const received = orders.filter((o) => o.status === "received");
  const onTime = received.filter(
    (o) => o.expectedDate && o.receivedDate && new Date(o.receivedDate) <= new Date(o.expectedDate),
  );
  const totalSpend = received.reduce((s, o) => s + (o.total || 0), 0);

  // Per-item price history: every (dated) line this supplier has been paid
  // for, newest first, so a price creeping up on the same SKU is visible.
  const priceHistory = new Map<
    string,
    { itemId: string; name: string; points: { date: Date; unitPrice: number; quantity: number; poNumber: string }[] }
  >();
  for (const o of received) {
    for (const line of o.items || []) {
      if (!line.itemId) continue;
      const key = String(line.itemId);
      if (!priceHistory.has(key)) priceHistory.set(key, { itemId: key, name: line.name, points: [] });
      priceHistory.get(key)!.points.push({
        date: o.receivedDate || o.createdAt,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        poNumber: o.poNumber,
      });
    }
  }
  for (const entry of priceHistory.values()) entry.points.sort((a, b) => +new Date(b.date) - +new Date(a.date));

  req.rData = {
    supplier: { _id: String((supplier as any)._id), name: (supplier as any).name },
    totals: {
      orders: orders.length,
      received: received.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      onTimeRate: received.length ? Math.round((onTime.length / received.length) * 1000) / 10 : null,
    },
    priceHistory: [...priceHistory.values()],
  };
  req.msg = "success";
  return next();
};

// ===== Purchase orders =====
// Every line must reference a real InventoryItem — the free-text name-match
// at receiving time this used to rely on was fragile and silently dropped
// unmatched lines. `name`/`unitPrice` are still stored (denormalized display
// + this PO's negotiated price), and batchNo/expiryDate are the EXPECTED lot
// for this line, used to create a proper InventoryBatch on receipt.
const normItems = async (
  raw: any[],
): Promise<{ items: any[]; invalid: string[] }> => {
  const lines = (Array.isArray(raw) ? raw : []).filter((it) => it && it.itemId);
  const items: any[] = [];
  const invalid: string[] = [];
  for (const it of lines) {
    const inv: any = await InventoryItem.findOne({
      _id: it.itemId,
      isDeleted: { $ne: true },
    })
      .select("name")
      .lean();
    if (!inv) {
      invalid.push(String(it.name || it.itemId));
      continue;
    }
    const quantity = Number(it.quantity) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    items.push({
      itemId: it.itemId,
      name: it.name?.trim() || inv.name,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
      batchNo: it.batchNo || undefined,
      expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
    });
  }
  return { items, invalid };
};

export const listPurchaseOrders = async (req: Request, _res: Response, next: NextFunction) => {
  const query: any = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.supplierId) query.supplierId = req.query.supplierId;
  const items = await PurchaseOrder.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("supplierId", "name gstin")
    .lean();
  req.rData = { items }; req.msg = "success"; return next();
};
export const createPurchaseOrder = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.supplierId) { req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "supplierId required" }; return next(); }
  const { items, invalid } = await normItems(b.items);
  if (invalid.length) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `Pick a valid catalog item for: ${invalid.join(", ")}` };
    return next();
  }
  if (items.length === 0) { req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "at least one item" }; return next(); }
  const total = items.reduce((s, it) => s + it.amount, 0);
  const seq = await nextSequence("purchase_order");
  const item = await PurchaseOrder.create({
    poNumber: `PO-${String(seq).padStart(6, "0")}`,
    supplierId: b.supplierId, items, total,
    status: b.status === "ordered" ? "ordered" : "draft",
    expectedDate: b.expectedDate ? new Date(b.expectedDate) : undefined,
    notes: b.notes,
  });
  req.rData = { item }; req.msg = "created"; return next();
};
export const updatePurchaseOrderStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toLowerCase();
  const allowed = ["draft", "ordered", "received", "cancelled"];
  if (!allowed.includes(status)) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: `status one of ${allowed.join(", ")}` };
    return next();
  }
  const existing: any = await PurchaseOrder.findById(req.params.id as string);
  if (!existing) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  const set: any = { status };
  // Receiving = goods receipt (GRN): fold each line into inventory stock once.
  // Guard on the prior status so re-saving a received PO never double-counts.
  if (status === "received" && existing.status !== "received") {
    set.receivedDate = new Date();
    const adminId = (req as any).adminId;
    for (const line of existing.items || []) {
      const qty = line.quantity || 0;
      if (!qty) continue;

      if (line.itemId) {
        // Real path: receiveBatch creates a proper InventoryBatch (this PO's
        // expected batchNo/expiryDate, if given) and bumps the item's total —
        // no more name-matching, this line is already linked to a real item.
        const result = await receiveBatch({
          itemId: line.itemId,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          quantity: qty,
          unitCost: line.unitPrice || undefined,
          source: "purchase_order",
          poNumber: existing.poNumber,
          performedByAdminId: adminId,
        });
        await StockTransaction.create({
          itemId: line.itemId,
          type: "in",
          quantity: qty,
          balanceAfter: result.currentStock,
          amount: line.unitPrice ? Math.round(line.unitPrice * qty * 100) / 100 : undefined,
          reason: `PO ${existing.poNumber} received`,
          performedByAdminId: adminId,
        });
      } else {
        // Legacy fallback, for POs created before lines were linked to a
        // catalog item — best-effort name match, no batch tracking.
        const inv: any = await InventoryItem.findOne({
          name: { $regex: `^${String(line.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          isDeleted: { $ne: true },
        });
        if (!inv) continue;
        inv.currentStock = (inv.currentStock || 0) + qty;
        if (line.unitPrice) inv.unitCost = line.unitPrice;
        await inv.save();
        await StockTransaction.create({
          itemId: inv._id,
          type: "in",
          quantity: qty,
          balanceAfter: inv.currentStock,
          amount: line.unitPrice ? Math.round(line.unitPrice * qty * 100) / 100 : undefined,
          reason: `PO ${existing.poNumber} received`,
          performedByAdminId: adminId,
        });
      }
    }
  }
  existing.status = status;
  if (set.receivedDate) existing.receivedDate = set.receivedDate;
  await existing.save();
  req.rData = { item: existing }; req.msg = "updated"; return next();
};
