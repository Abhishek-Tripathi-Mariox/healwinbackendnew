import { Request, Response } from "express";
import { CmsPage } from "../models/cms-page.model";

// Get CMS page by slug (public)
export const getCmsPageBySlug = async (req: Request, res: Response) => {
  const page = await CmsPage.findOne({ slug: (req.params.slug as string), isActive: true }).lean();
  if (!page)
    return res.status(404).json({ success: false, message: "Page not found" });
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = page;
};

// List all active CMS pages (slugs + titles only)
export const listCmsPages = async (_req: Request, res: Response) => {
  const pages = await CmsPage.find({ isActive: true })
    .select("slug title updatedAt")
    .sort({ createdAt: -1 });
  res.locals.data = pages;
};
