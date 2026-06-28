import { Request, Response, NextFunction } from "express";
import { Supplier, PurchaseOrder } from "../../models/procurement.model";
import { nextSequence } from "../../models/counter.model";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";

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

// ===== Purchase orders =====
const normItems = (raw: any[]) =>
  (Array.isArray(raw) ? raw : [])
    .filter((it) => it && it.name)
    .map((it) => {
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      return { name: String(it.name), quantity, unitPrice, amount: quantity * unitPrice };
    });

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
  const items = normItems(b.items);
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
    const adminId = (req as any).admin?._id;
    for (const line of existing.items || []) {
      const inv: any = await InventoryItem.findOne({
        name: { $regex: `^${String(line.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        isDeleted: { $ne: true },
      });
      if (!inv) continue; // unmatched item names are skipped (no auto-create)
      inv.currentStock = (inv.currentStock || 0) + (line.quantity || 0);
      if (line.unitPrice) inv.unitCost = line.unitPrice;
      await inv.save();
      await StockTransaction.create({
        itemId: inv._id,
        type: "in",
        quantity: line.quantity || 0,
        balanceAfter: inv.currentStock,
        reason: `PO ${existing.poNumber} received`,
        performedByAdminId: adminId,
      });
    }
  }
  existing.status = status;
  if (set.receivedDate) existing.receivedDate = set.receivedDate;
  await existing.save();
  req.rData = { item: existing }; req.msg = "updated"; return next();
};
