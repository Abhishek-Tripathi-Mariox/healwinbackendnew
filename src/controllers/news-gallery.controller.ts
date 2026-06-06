import { Request, Response } from "express";
import { NewsArticle } from "../models/news-article.model";
import { GalleryImage } from "../models/gallery-image.model";
import { ArticleSubmission } from "../models/article-submission.model";
import { uploadMultipleFilesToAws } from "../utils/s3";

// Get published news articles
export const getPublishedArticles = async (req: Request, res: Response) => {
  const { category, limit } = req.query as {
    category?: string;
    limit?: string;
  };
  const filter: Record<string, any> = { isPublished: true };
  if (category) filter.category = category;

  let query = NewsArticle.find(filter)
    .select("-content -createdBy -updatedBy")
    .sort({ isFeatured: -1, publishedAt: -1 });

  if (limit) query = query.limit(Number(limit));

  const articles = await query.lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = articles;
};

// Get single article by slug
export const getArticleBySlug = async (req: Request, res: Response) => {
  const article = await NewsArticle.findOne({
    slug: req.params.slug,
    isPublished: true,
  }).select("-createdBy -updatedBy");

  if (!article)
    return res
      .status(404)
      .json({ success: false, message: "Article not found" });
  res.locals.data = article;
};

// Get article categories (published only)
export const getArticleCategories = async (_req: Request, res: Response) => {
  const categories = await NewsArticle.distinct("category", {
    isPublished: true,
  });
  res.locals.data = categories.filter(Boolean).sort();
};

// Get active gallery images
export const getGalleryImages = async (req: Request, res: Response) => {
  const { category } = req.query as { category?: string };
  const filter: Record<string, any> = { isActive: true };
  if (category) filter.category = category;

  const images = await GalleryImage.find(filter)
    .select("-createdBy -updatedBy")
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = images;
};

// Get gallery categories (active only)
export const getGalleryCategories = async (_req: Request, res: Response) => {
  const categories = await GalleryImage.distinct("category", {
    isActive: true,
  });
  res.locals.data = categories.filter(Boolean).sort();
};

// Submit an article (public - no auth)
export const submitArticle = async (req: Request, res: Response) => {
  const { title, content, authorName, authorEmail, submissionType } = req.body;
  const files = (req.files as Express.Multer.File[]) || [];
  const type = submissionType === "gallery" ? "gallery" : "article";

  if (!title || !authorName || !authorEmail) {
    return res
      .status(400)
      .json({ success: false, message: "Title, name, and email are required" });
  }

  if (type === "article" && !content) {
    return res
      .status(400)
      .json({ success: false, message: "Content is required for article submissions" });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(authorEmail)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email address" });
  }

  let attachments: {
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
  }[] = [];

  if (files.length > 0) {
    const uploadResult = await uploadMultipleFilesToAws(files);
    const uploadedUrls = Array.isArray(uploadResult.images)
      ? uploadResult.images
      : [uploadResult.images];

    attachments = files
      .map((file, index) => ({
        url: uploadedUrls[index] || "",
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      }))
      .filter((file) => !!file.url);
  }

  const submission = await ArticleSubmission.create({
    submissionType: type,
    title,
    content: content || "",
    authorName,
    authorEmail,
    attachments,
  });

  res.locals.data = {
    message:
      "Article submitted successfully. It will be reviewed before publishing.",
    id: submission._id,
  };
};
