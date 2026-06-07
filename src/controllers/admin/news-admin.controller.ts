import { Request, Response } from "express";
import { NewsArticle } from "../../models/news-article.model";
import { uploadFileToAws, uploadMultipleFilesToAws } from "../../utils/s3";
import { paginate } from "../../utils/paginate.util";
import { invalidateCache } from "../../middlewares/cache.middleware";

// ── News Articles ──

export const getAllArticles = async (req: Request, res: Response) => {
  const { status, q, category } = req.query as {
    status?: string;
    q?: string;
    category?: string;
  };
  const filter: Record<string, any> = {};

  if (status === "published") filter.isPublished = true;
  if (status === "draft") filter.isPublished = false;
  if (category) filter.category = category;
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { author: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(NewsArticle, filter, req, {
    isFeatured: -1,
    publishedAt: -1,
    createdAt: -1,
  });
  res.locals.data = result;
};

export const getArticleById = async (req: Request, res: Response) => {
  const article = await NewsArticle.findById(req.params.id);
  if (!article)
    return res
      .status(404)
      .json({ success: false, message: "Article not found" });
  res.locals.data = article;
};

export const createArticle = async (req: Request, res: Response) => {
  const {
    title,
    excerpt,
    content,
    category,
    author,
    readTime,
    isFeatured,
    isPublished,
    publishedAt,
    sortOrder,
  } = req.body;

  if (!title) {
    return res
      .status(400)
      .json({ success: false, message: "Title is required" });
  }

  let imageUrls: string[] = [];
  const imageFiles = req.files as Express.Multer.File[] | undefined;
  if (imageFiles && imageFiles.length > 0) {
    const uploadResult = await uploadMultipleFilesToAws(imageFiles);
    imageUrls = Array.isArray(uploadResult.images) ? uploadResult.images : [uploadResult.images as string];
  }

  // Parse existing images from body
  const existingImages: string[] = [];
  if (req.body.existingImages) {
    try {
      const parsed = JSON.parse(req.body.existingImages);
      if (Array.isArray(parsed)) existingImages.push(...parsed);
    } catch {
      // ignore parse errors
    }
  }
  const allImages = [...existingImages, ...imageUrls];

  const article = await NewsArticle.create({
    title,
    excerpt,
    content,
    image: allImages[0] || "",
    images: allImages,
    category: category || "General",
    author: author || "HealWin Team",
    readTime: readTime || "3 min read",
    isFeatured: isFeatured === "true" || isFeatured === true,
    isPublished: isPublished === "true" || isPublished === true,
    publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    createdBy: (req as any).admin?._id,
  });

  await invalidateCache("/v1/api/news-gallery");
  res.locals.data = article;
};

export const updateArticle = async (req: Request, res: Response) => {
  const {
    title,
    excerpt,
    content,
    category,
    author,
    readTime,
    isFeatured,
    isPublished,
    publishedAt,
    sortOrder,
  } = req.body;

  const update: Record<string, any> = {};
  if (title !== undefined) update.title = title;
  if (excerpt !== undefined) update.excerpt = excerpt;
  if (content !== undefined) update.content = content;
  if (category !== undefined) update.category = category;
  if (author !== undefined) update.author = author;
  if (readTime !== undefined) update.readTime = readTime;
  if (isFeatured !== undefined)
    update.isFeatured = isFeatured === "true" || isFeatured === true;
  if (isPublished !== undefined)
    update.isPublished = isPublished === "true" || isPublished === true;
  if (publishedAt !== undefined)
    update.publishedAt = publishedAt ? new Date(publishedAt) : null;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  // If marking as featured, un-feature all others
  if (update.isFeatured) {
    await NewsArticle.updateMany(
      { _id: { $ne: (req.params.id as string) } },
      { isFeatured: false },
    );
  }

  const imageFiles = req.files as Express.Multer.File[] | undefined;
  let newImageUrls: string[] = [];
  if (imageFiles && imageFiles.length > 0) {
    const uploadResult = await uploadMultipleFilesToAws(imageFiles);
    newImageUrls = Array.isArray(uploadResult.images) ? uploadResult.images : [uploadResult.images as string];
  }

  // Parse existing images the client wants to keep
  if (req.body.existingImages !== undefined) {
    let existingImages: string[] = [];
    try {
      const parsed = JSON.parse(req.body.existingImages);
      if (Array.isArray(parsed)) existingImages = parsed;
    } catch {
      // ignore
    }
    const allImages = [...existingImages, ...newImageUrls];
    update.images = allImages;
    update.image = allImages[0] || "";
  } else if (newImageUrls.length > 0) {
    // Only new uploads, append to existing
    const existing = await NewsArticle.findById(req.params.id).select("images").lean();
    const currentImages = existing?.images || [];
    const allImages = [...currentImages, ...newImageUrls];
    update.images = allImages;
    update.image = allImages[0] || "";
  }

  update.updatedBy = (req as any).admin?._id;

  const article = await NewsArticle.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!article)
    return res
      .status(404)
      .json({ success: false, message: "Article not found" });
  await invalidateCache("/v1/api/news-gallery");
  res.locals.data = article;
};

export const deleteArticle = async (req: Request, res: Response) => {
  const article = await NewsArticle.findByIdAndDelete(req.params.id);
  if (!article)
    return res
      .status(404)
      .json({ success: false, message: "Article not found" });
  res.locals.data = { message: "Article deleted" };
  await invalidateCache("/v1/api/news-gallery");
};

export const getArticleCategories = async (_req: Request, res: Response) => {
  const categories = await NewsArticle.distinct("category");
  res.locals.data = categories.filter(Boolean).sort();
};

export const uploadContentImage = async (req: Request, res: Response) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No image file provided" });
  }
  const result = await uploadFileToAws([req.file]);
  res.locals.data = { url: result.images };
};
