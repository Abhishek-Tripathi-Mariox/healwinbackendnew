import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  ArticleSubmission,
  IArticleSubmission,
} from "../../models/article-submission.model";
import NewsArticle from "../../models/news-article.model";
import GalleryImage from "../../models/gallery-image.model";
import { paginate } from "../../utils/paginate.util";

/**
 * Publish an approved submission into the public-facing collection the
 * website actually reads from: article → NewsArticle (isPublished), gallery
 * → GalleryImage (isActive). Returns the id of the created record so the
 * submission can be marked published (idempotent — callers skip if already
 * set). Image attachments become the record's image / images.
 */
export const publishSubmission = async (
  submission: IArticleSubmission,
  adminId?: Types.ObjectId,
): Promise<Types.ObjectId> => {
  const imageUrls = (submission.attachments || [])
    .filter((a) => a.mimeType?.startsWith("image/"))
    .map((a) => a.url);

  if (submission.submissionType === "gallery") {
    const item = await GalleryImage.create({
      title: submission.title,
      description: submission.content || "",
      image: imageUrls[0] || "",
      images: imageUrls,
      isActive: true,
      createdBy: adminId,
    });
    return item._id;
  }

  // article → news. slug is unique, so derive a base from the title and
  // append a short suffix to avoid collisions between same-titled posts.
  const baseSlug =
    submission.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "submission";
  const excerpt = (submission.content || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 160);

  const article = await NewsArticle.create({
    title: submission.title,
    slug: `${baseSlug}-${submission._id.toString().slice(-6)}`,
    content: submission.content || "",
    excerpt,
    image: imageUrls[0] || "",
    images: imageUrls,
    author: submission.authorName || "HealWin Team",
    isPublished: true,
    createdBy: adminId,
  });
  return article._id;
};

export const getAllSubmissions = async (req: Request, res: Response) => {
  const { status, q, type } = req.query as { status?: string; q?: string; type?: string };
  const filter: Record<string, any> = {};

  if (type) filter.submissionType = type;
  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { authorName: { $regex: q, $options: "i" } },
      { authorEmail: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(
    ArticleSubmission,
    filter,
    req,
    { createdAt: -1 },
    [{ path: "reviewedBy", select: "name" }],
  );
  res.locals.data = result;
};

export const getSubmissionById = async (req: Request, res: Response) => {
  const submission = await ArticleSubmission.findById(req.params.id).populate(
    "reviewedBy",
    "name",
  );
  if (!submission)
    return res
      .status(404)
      .json({ success: false, message: "Submission not found" });
  res.locals.data = submission;
};

export const reviewSubmission = async (req: Request, res: Response) => {
  const { status, reviewNote } = req.body;

  if (!status || !["approved", "rejected"].includes(status)) {
    return res
      .status(400)
      .json({ success: false, message: "Status must be approved or rejected" });
  }

  const submission = await ArticleSubmission.findById(req.params.id);
  if (!submission)
    return res
      .status(404)
      .json({ success: false, message: "Submission not found" });

  const adminId = (req as any).admin?._id;

  // Publish into the public News / Gallery the first time it's approved.
  // Guarded by publishedRefId so re-approving never creates duplicates.
  if (status === "approved" && !submission.publishedRefId) {
    submission.publishedRefId = await publishSubmission(submission, adminId);
  }

  submission.status = status;
  submission.reviewNote = reviewNote || "";
  submission.reviewedBy = adminId;
  submission.reviewedAt = new Date();
  await submission.save();
  await submission.populate("reviewedBy", "name");

  res.locals.data = submission;
};

export const deleteSubmission = async (req: Request, res: Response) => {
  const submission = await ArticleSubmission.findByIdAndDelete(req.params.id);
  if (!submission)
    return res
      .status(404)
      .json({ success: false, message: "Submission not found" });
  res.locals.data = { message: "Submission deleted" };
};
