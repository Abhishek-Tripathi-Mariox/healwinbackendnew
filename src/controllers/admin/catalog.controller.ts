import { Request, Response, NextFunction } from "express";
import { Model } from "mongoose";
import LabTest from "../../models/lab-test.model";
import PharmacyProduct from "../../models/pharmacy-product.model";

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
      { _id: req.params.id, isDeleted: false },
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

export const products = makeCrud(PharmacyProduct, ["name", "brand", "category"]);
export const tests = makeCrud(LabTest, ["name", "category"]);
