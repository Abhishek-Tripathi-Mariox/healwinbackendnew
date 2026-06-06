import { Request, Response } from "express";
import { CmsPage } from "../../models/cms-page.model";
import { uploadFileToAws } from "../../utils/s3";
import { paginate } from "../../utils/paginate.util";
import { invalidateCache } from "../../middlewares/cache.middleware";

export const getAllCmsPages = async (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };
  const filter: Record<string, any> = {};
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { slug: { $regex: q, $options: "i" } },
    ];
  }
  const result = await paginate(CmsPage, filter, req, { createdAt: -1 }, [
    { path: "updatedBy", select: "name email" },
  ]);
  res.locals.data = result;
};

export const getCmsPageById = async (req: Request, res: Response) => {
  const page = await CmsPage.findById(req.params.id).populate(
    "updatedBy",
    "name email",
  );
  if (!page)
    return res
      .status(404)
      .json({ success: false, message: "CMS page not found" });
  res.locals.data = page;
};

export const createCmsPage = async (req: Request, res: Response) => {
  const { slug, title, content, isActive } = req.body;
  if (!slug || !title || !content) {
    return res.status(400).json({
      success: false,
      message: "Slug, title, and content are required",
    });
  }
  const existing = await CmsPage.findOne({ slug: slug.toLowerCase() });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "A page with this slug already exists",
    });
  }
  const adminId = (req as any).admin?._id || (req as any).admin?.id;
  const page = await CmsPage.create({
    slug: slug.toLowerCase(),
    title,
    content: content || "",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    updatedBy: adminId,
  });
  await invalidateCache("/v1/api/cms");
  res.locals.data = page;
};

export const updateCmsPage = async (req: Request, res: Response) => {
  const { title, content, isActive } = req.body;
  const update: Record<string, any> = {};
  if (title !== undefined) update.title = title;
  if (content !== undefined) update.content = content;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;

  const adminId = (req as any).admin?._id || (req as any).admin?.id;
  if (adminId) update.updatedBy = adminId;

  const page = await CmsPage.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  }).populate("updatedBy", "name email");
  if (!page)
    return res
      .status(404)
      .json({ success: false, message: "CMS page not found" });
  await invalidateCache("/v1/api/cms");
  res.locals.data = page;
};

export const deleteCmsPage = async (req: Request, res: Response) => {
  const page = await CmsPage.findByIdAndDelete(req.params.id);
  if (!page)
    return res
      .status(404)
      .json({ success: false, message: "CMS page not found" });
  res.locals.data = { message: "CMS page deleted" };
  await invalidateCache("/v1/api/cms");
};

export const uploadCmsImage = async (req: Request, res: Response) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No image file provided" });
  }
  const result = await uploadFileToAws([req.file]);
  res.locals.data = { url: result.images };
};
