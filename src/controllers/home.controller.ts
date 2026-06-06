import { Request, Response } from "express";
import { HomeContent } from "../models/home-content.model";
import { Service } from "../models/service.model";
import { VisitorCounter } from "../models/visitor-counter.model";

// GET /home-content — Public homepage content + top N services
export const getHomeContent = async (_req: Request, res: Response) => {
  let content = await HomeContent.findOne().lean();
  if (!content) {
    const created = await HomeContent.create({});
    content = created.toObject();
  }

  // Fetch top N active services sorted by isPriority desc, sortOrder asc
  const limit = content.servicesCount || 4;
  const services = await Service.find({ isActive: true })
    .sort({ isPriority: -1, sortOrder: 1 })
    .limit(limit)
    .lean();

  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = { ...content, services };
};

// POST /home-content/visitor/register — Increment counter and return visitor number
export const registerVisit = async (_req: Request, res: Response) => {
  const counter = await VisitorCounter.findOneAndUpdate(
    {},
    { $inc: { totalCount: 1 } },
    { upsert: true, returnDocument: "after" },
  );

  res.json({ success: true, data: { visitorNumber: counter.totalCount } });
};

// GET /home-content/visitor/count — Get total visitor count
export const getVisitorCount = async (_req: Request, res: Response) => {
  let counter = await VisitorCounter.findOne().lean();
  if (!counter) {
    counter = await VisitorCounter.create({ totalCount: 0 });
  }

  res.json({ success: true, data: { count: counter.totalCount } });
};
