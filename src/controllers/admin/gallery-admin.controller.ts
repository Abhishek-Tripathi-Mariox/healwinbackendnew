import { Request, Response } from "express";
import { GalleryImage } from "../../models/gallery-image.model";
import { uploadMultipleFilesToAws } from "../../utils/s3";
import { paginate } from "../../utils/paginate.util";
import { invalidateCache } from "../../middlewares/cache.middleware";

export const getAllImages = async (req: Request, res: Response) => {
  const { q, category } = req.query as { q?: string; category?: string };
  const filter: Record<string, any> = {};

  if (category) filter.category = category;
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(GalleryImage, filter, req, {
    sortOrder: 1,
    createdAt: -1,
  });
  res.locals.data = result;
};

export const getImageById = async (req: Request, res: Response) => {
  const image = await GalleryImage.findById(req.params.id);
  if (!image)
    return res.status(404).json({ success: false, message: "Image not found" });
  res.locals.data = image;
};

export const createImage = async (req: Request, res: Response) => {
  const { title, category, description, isActive, sortOrder } = req.body;

  if (!title) {
    return res
      .status(400)
      .json({ success: false, message: "Title is required" });
  }

  const files = (req.files as Express.Multer.File[]) || [];
  let imageUrls: string[] = [];

  if (files.length > 0) {
    const uploadResult = await uploadMultipleFilesToAws(files);
    imageUrls = uploadResult.images as string[];
  }

  if (imageUrls.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "At least one image is required" });
  }

  const galleryImage = await GalleryImage.create({
    title,
    image: imageUrls[0],
    images: imageUrls,
    category: category || "General",
    description: description || "",
    isActive:
      isActive === "true" || isActive === true || isActive === undefined,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    createdBy: (req as any).admin?._id,
  });

  await invalidateCache("/v1/api/news-gallery");
  res.locals.data = galleryImage;
};

export const updateImage = async (req: Request, res: Response) => {
  const { title, category, description, isActive, sortOrder } = req.body;

  const update: Record<string, any> = {};
  if (title !== undefined) update.title = title;
  if (category !== undefined) update.category = category;
  if (description !== undefined) update.description = description;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  // Merge existing images the admin wants to keep + newly uploaded files
  let existing: string[] = [];
  if (req.body.existingImages) {
    try {
      existing = JSON.parse(req.body.existingImages);
    } catch {
      existing = [];
    }
  }

  const files = (req.files as Express.Multer.File[]) || [];
  let newUrls: string[] = [];
  if (files.length > 0) {
    const uploadResult = await uploadMultipleFilesToAws(files);
    newUrls = uploadResult.images as string[];
  }

  const allImages = [...existing, ...newUrls];
  if (allImages.length > 0) {
    update.images = allImages;
    update.image = allImages[0];
  }

  update.updatedBy = (req as any).admin?._id;

  const image = await GalleryImage.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!image)
    return res.status(404).json({ success: false, message: "Image not found" });
  await invalidateCache("/v1/api/news-gallery");
  res.locals.data = image;
};

export const deleteImage = async (req: Request, res: Response) => {
  const image = await GalleryImage.findByIdAndDelete(req.params.id);
  if (!image)
    return res.status(404).json({ success: false, message: "Image not found" });
  res.locals.data = { message: "Image deleted" };
  await invalidateCache("/v1/api/news-gallery");
};

export const getGalleryCategories = async (_req: Request, res: Response) => {
  const categories = await GalleryImage.distinct("category");
  res.locals.data = categories.filter(Boolean).sort();
};
