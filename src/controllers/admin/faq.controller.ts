import { Request, Response, NextFunction } from "express";
import { FAQ } from "../../models/content.model";
import { cache } from "../../utils/redis.util";

/**
 * Admin CRUD for the patient-app Help & Support FAQs. The public app reads
 * these via /support/faqs (cached 1h) — every mutation clears that cache so
 * changes show immediately.
 */

const clearFaqCache = async () => {
  await cache.del("faqs:all").catch(() => undefined);
};

export const list = async (_req: Request, _res: Response, next: NextFunction) => {
  const items = await FAQ.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
  _req.rData = { items };
  _req.msg = "success";
  return next();
};

export const create = async (req: Request, _res: Response, next: NextFunction) => {
  const { question, answer, category, sortOrder, isActive } = req.body || {};
  if (!question || !answer) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "question and answer are required" };
    return next();
  }
  const item = await FAQ.create({
    question,
    answer,
    category: category || "General",
    sortOrder: Number(sortOrder) || 0,
    isActive: isActive !== false,
  });
  await clearFaqCache();
  req.rData = { item };
  req.msg = "success";
  return next();
};

export const update = async (req: Request, _res: Response, next: NextFunction) => {
  const { question, answer, category, sortOrder, isActive } = req.body || {};
  const patch: any = {};
  if (question !== undefined) patch.question = question;
  if (answer !== undefined) patch.answer = answer;
  if (category !== undefined) patch.category = category;
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder) || 0;
  if (isActive !== undefined) patch.isActive = !!isActive;
  const item = await FAQ.findByIdAndUpdate(req.params.id as string, patch, { new: true }).lean();
  await clearFaqCache();
  req.rData = { item };
  req.msg = "success";
  return next();
};

export const remove = async (req: Request, _res: Response, next: NextFunction) => {
  await FAQ.findByIdAndDelete(req.params.id as string);
  await clearFaqCache();
  req.rData = { deleted: true };
  req.msg = "success";
  return next();
};
