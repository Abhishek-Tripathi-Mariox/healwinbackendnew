import { Request, Response, NextFunction } from "express";
import { FAQ } from "../../models/content.model";
import { cache } from "../../utils/redis.util";
import { paginate } from "../../utils/paginate.util";
import { escapeRegex } from "../../utils/helpers";

/**
 * Admin CRUD for the patient-app Help & Support FAQs. The public app reads
 * these via /support/faqs (cached 1h) — every mutation clears that cache so
 * changes show immediately.
 */

const clearFaqCache = async () => {
  await cache.del("faqs:all").catch(() => undefined);
};

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const { search, category, isActive } = req.query;
  const filter: Record<string, any> = {};
  if (typeof search === "string" && search.trim()) {
    const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
    filter.$or = [{ question: rx }, { answer: rx }, { category: rx }];
  }
  if (typeof category === "string" && category.trim()) {
    filter.category = category.trim();
  }
  if (typeof isActive === "string") filter.isActive = isActive === "true";

  const { items, pagination } = await paginate<any>(FAQ, filter, req, {
    sortOrder: 1,
    createdAt: 1,
  });
  req.rData = { items, pagination };
  req.msg = "success";
  return next();
};

/**
 * The page can only compare against the rows it has on screen, and once the
 * list is paginated that is no longer the whole collection — so the "this
 * question already exists" rule has to be decided here.
 */
const duplicateQuestion = async (question: string, exceptId?: string) => {
  const filter: Record<string, any> = {
    question: { $regex: `^${escapeRegex(question.trim())}$`, $options: "i" },
  };
  if (exceptId) filter._id = { $ne: exceptId };
  return !!(await FAQ.exists(filter));
};

export const create = async (req: Request, _res: Response, next: NextFunction) => {
  const { question, answer, category, sortOrder, isActive } = req.body || {};
  if (!question || !answer) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "question and answer are required" };
    return next();
  }
  if (await duplicateQuestion(String(question))) {
    req.rCode = 0;
    req.msg = "duplicate_question";
    req.rData = { hint: "An FAQ with this question already exists" };
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
  if (question !== undefined) {
    if (await duplicateQuestion(String(question), req.params.id as string)) {
      req.rCode = 0;
      req.msg = "duplicate_question";
      req.rData = { hint: "An FAQ with this question already exists" };
      return next();
    }
    patch.question = question;
  }
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
