import { Request, Response, NextFunction } from "express";
import { Model } from "mongoose";
import LabTest from "../../models/lab-test.model";
import PharmacyProduct from "../../models/pharmacy-product.model";
import InventoryItem from "../../models/inventory-item.model";
import Procedure from "../../models/procedure.model";

/**
 * Admin CRUD for the patient-app catalog (pharmacy products / lab tests).
 * Doctors are NOT here — a doctor is an admin user with the "Doctor" role
 * (managed in Admin Management), single source of truth for both the panel
 * login and the app's "Consult a Doctor" listing.
 *
 * Both resources share the same shape (soft-deletable, searchable by name), so
 * a small factory generates list/create/update/remove for each.
 */

const makeCrud = (model: Model<any>, searchFields: string[]) => ({
  list: async (req: Request, _res: Response, next: NextFunction) => {
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));
    const search = ((req.query.search as string) || "").trim();
    const query: any = { isDeleted: false };
    if (req.query.status === "active") query.isActive = true;
    if (req.query.status === "inactive") query.isActive = false;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    const [items, total] = await Promise.all([
      model.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      model.countDocuments(query),
    ]);
    req.rData = { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    req.msg = "success";
    return next();
  },

  create: async (req: Request, _res: Response, next: NextFunction) => {
    const item = await model.create({ ...req.body, isDeleted: false });
    req.rData = { item };
    req.msg = "success";
    return next();
  },

  update: async (req: Request, _res: Response, next: NextFunction) => {
    const item = await model.findOneAndUpdate(
      { _id: (req.params.id as string), isDeleted: false },
      { $set: req.body },
      { new: true },
    );
    if (!item) {
      req.rCode = 5;
      req.msg = "not_available";
      req.rData = {};
      return next();
    }
    req.rData = { item };
    req.msg = "success";
    return next();
  },

  remove: async (req: Request, _res: Response, next: NextFunction) => {
    await model.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false });
    req.rData = {};
    req.msg = "success";
    return next();
  },
});

const productCrud = makeCrud(PharmacyProduct, ["name", "brand", "category"]);

/**
 * Overlay the real HMS InventoryItem.currentStock onto any product linked
 * via itemId — that's the authoritative number once linked, not the static
 * `stock` field (which stops being written to once a product is linked; see
 * PharmacyProduct.itemId doc comment).
 */
const withLinkedStock = async (rows: any[]) => {
  const itemIds = rows.map((r) => r.itemId).filter(Boolean);
  if (!itemIds.length) return rows;
  const items = await InventoryItem.find({ _id: { $in: itemIds } })
    .select("name sku currentStock unit")
    .lean();
  const byId = new Map(items.map((it: any) => [String(it._id), it]));
  return rows.map((r) => {
    if (!r.itemId) return r;
    const it: any = byId.get(String(r.itemId));
    if (!it) return r;
    return { ...r, stock: it.currentStock, linkedItemName: it.name, linkedItemSku: it.sku, linkedItemUnit: it.unit };
  });
};

export const products = {
  ...productCrud,
  list: async (req: Request, res: Response, next: NextFunction) => {
    await productCrud.list(req, res, async () => {
      req.rData.items = await withLinkedStock(req.rData.items);
      next();
    });
  },
};
export const tests = makeCrud(LabTest, ["name", "category"]);
export const procedures = makeCrud(Procedure, ["name", "category"]);

/** GET /admin/catalog/inventory-items — picker source for linking a pharmacy product to real HMS stock. */
export const inventoryItemOptions = async (req: Request, _res: Response, next: NextFunction) => {
  const search = ((req.query.search as string) || "").trim();
  const query: any = { isDeleted: false, isActive: true };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ name: rx }, { sku: rx }];
  }
  const items = await InventoryItem.find(query).select("name sku currentStock unit").sort({ name: 1 }).limit(50).lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};
