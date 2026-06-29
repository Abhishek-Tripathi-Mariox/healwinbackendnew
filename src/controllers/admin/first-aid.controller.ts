import { Request, Response, NextFunction } from "express";
import FirstAidGuide from "../../models/first-aid-guide.model";

/** Admin CRUD for patient-app first-aid / emergency education content. */
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const items = await FirstAidGuide.find({ isDeleted: { $ne: true } })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const create = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  if (!b.title) {
    req.rCode = 0; req.msg = "validation_failed"; req.rData = { hint: "title required" };
    return next();
  }
  const item = await FirstAidGuide.create({
    title: b.title,
    category: b.category,
    type: b.type === "article" ? "article" : "video",
    videoUrl: b.videoUrl,
    thumbnailUrl: b.thumbnailUrl,
    content: b.content,
    durationLabel: b.durationLabel,
    sortOrder: Number(b.sortOrder) || 0,
  });
  req.rData = { item }; req.msg = "created"; return next();
};

export const update = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const item = await FirstAidGuide.findByIdAndUpdate(
    req.params.id as string,
    {
      $set: {
        title: b.title, category: b.category, type: b.type, videoUrl: b.videoUrl,
        thumbnailUrl: b.thumbnailUrl, content: b.content, durationLabel: b.durationLabel,
        sortOrder: b.sortOrder, isActive: b.isActive,
      },
    },
    { new: true },
  );
  if (!item) { req.rCode = 5; req.msg = "not_available"; req.rData = {}; return next(); }
  req.rData = { item }; req.msg = "updated"; return next();
};

export const remove = async (req: Request, _res: Response, next: NextFunction) => {
  await FirstAidGuide.findByIdAndUpdate(req.params.id as string, { isDeleted: true, isActive: false });
  req.rData = {}; req.msg = "deleted"; return next();
};
