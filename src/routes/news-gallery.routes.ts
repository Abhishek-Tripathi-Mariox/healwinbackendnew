import { Router } from "express";
import * as NewsGalleryController from "../controllers/news-gallery.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";
import multer from "multer";

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const articleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only images, PDF, and DOC/DOCX files are allowed"));
    }
  },
});

const router = Router();

// News articles (published)
router.get(
  "/articles",
  cacheResponse(300),
  ErrorHandlerMiddleware(NewsGalleryController.getPublishedArticles),
  ResponseMiddleware,
);
router.get(
  "/articles/categories",
  cacheResponse(300),
  ErrorHandlerMiddleware(NewsGalleryController.getArticleCategories),
  ResponseMiddleware,
);
router.get(
  "/articles/:slug",
  cacheResponse(300),
  ErrorHandlerMiddleware(NewsGalleryController.getArticleBySlug),
  ResponseMiddleware,
);

// Gallery images (active)
router.get(
  "/gallery",
  cacheResponse(300),
  ErrorHandlerMiddleware(NewsGalleryController.getGalleryImages),
  ResponseMiddleware,
);
router.get(
  "/gallery/categories",
  cacheResponse(300),
  ErrorHandlerMiddleware(NewsGalleryController.getGalleryCategories),
  ResponseMiddleware,
);

// Article submission (public)
router.post(
  "/submit-article",
  articleUpload.array("attachments", 10),
  ErrorHandlerMiddleware(NewsGalleryController.submitArticle),
  ResponseMiddleware,
);

export default router;
