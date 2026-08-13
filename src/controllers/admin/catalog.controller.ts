import { Request, Response, NextFunction } from "express";
import { Model } from "mongoose";
import LabTest from "../../models/lab-test.model";
import PharmacyProduct from "../../models/pharmacy-product.model";
import InventoryItem from "../../models/inventory-item.model";
import Procedure from "../../models/procedure.model";
import Pharmacy from "../../models/pharmacy.model";
import Lab from "../../models/lab.model";

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

/**
 * Resolve the owning facility's name onto each row so the catalogue table can
 * show "which pharmacy / which lab" without a second round-trip. `field` is the
 * FK on the row; unlinked rows pass through untouched.
 */
const withFacilityName = async (
  rows: any[],
  field: "pharmacyId" | "labId",
  model: Model<any>,
) => {
  const ids = rows.map((r) => r[field]).filter(Boolean);
  if (!ids.length) return rows;
  const facilities = await model
    .find({ _id: { $in: ids } })
    .select("name")
    .lean();
  const byId = new Map(facilities.map((f: any) => [String(f._id), f.name]));
  return rows.map((r) =>
    r[field] ? { ...r, facilityName: byId.get(String(r[field])) || "" } : r,
  );
};

const testCrud = makeCrud(LabTest, ["name", "category"]);

/**
 * A product linked to an HMS inventory item must not keep its own `stock`
 * number: inventory (with batches and FEFO) is the source of truth, the list
 * already overlays the real figure, and a leftover copy is a second number
 * that silently goes stale. Clear it on write.
 */
const stripStockWhenLinked = (body: any) => {
  if (!body) return body;
  if (body.itemId) return { ...body, stock: 0 };
  return body;
};

export const products = {
  ...productCrud,
  create: async (req: Request, res: Response, next: NextFunction) => {
    req.body = stripStockWhenLinked(req.body);
    return productCrud.create(req, res, next);
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    req.body = stripStockWhenLinked(req.body);
    return productCrud.update(req, res, next);
  },
  list: async (req: Request, res: Response, next: NextFunction) => {
    await productCrud.list(req, res, async () => {
      req.rData.items = await withLinkedStock(req.rData.items);
      req.rData.items = await withFacilityName(
        req.rData.items,
        "pharmacyId",
        Pharmacy,
      );
      next();
    });
  },
};
export const tests = {
  ...testCrud,
  list: async (req: Request, res: Response, next: NextFunction) => {
    await testCrud.list(req, res, async () => {
      req.rData.items = await withFacilityName(req.rData.items, "labId", Lab);
      next();
    });
  },
};
export const procedures = makeCrud(Procedure, ["name", "category"]);

/**
 * Picker sources for linking a catalogue entry to the facility that provides it.
 * Only approved + active + non-deleted facilities are offered — you should not
 * be able to attach a product to a pharmacy that was rejected or removed.
 */
const facilityOptions =
  (model: Model<any>) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const search = ((req.query.search as string) || "").trim();
    const query: any = { isDeleted: false, isActive: true, status: "approved" };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: rx }, { address: rx }];
    }
    const items = await model
      .find(query)
      .select("name address")
      .sort({ name: 1 })
      .limit(100)
      .lean();
    req.rData = { items };
    req.msg = "success";
    return next();
  };

/** GET /admin/catalog/pharmacies — picker source for scoping a product to an outlet. */
export const pharmacyOptions = facilityOptions(Pharmacy);

/** GET /admin/catalog/labs — picker source for scoping a test to a lab. */
export const labOptions = facilityOptions(Lab);

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
