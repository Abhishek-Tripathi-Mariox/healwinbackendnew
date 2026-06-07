import { Request, Response } from "express";
import { ServiceCategory } from "../models/service-category.model";

export const listCategories = async (_req: Request, res: Response) => {
  const categories = await ServiceCategory.find({ isActive: true }).sort({
    sortOrder: 1,
    createdAt: -1,
  });
  res.locals.data = categories;
};

export const getCategoryBySlug = async (req: Request, res: Response) => {
  const category = await ServiceCategory.findOne({
    slug: (req.params.slug as string),
    isActive: true,
  });
  if (!category) {
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }
  res.locals.data = category;
};
