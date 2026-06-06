import { Request, Response } from "express";
import { AboutContent } from "../../models/about-content.model";
import { invalidateCache } from "../../middlewares/cache.middleware";

// GET - Get the about page content (singleton)
export const getAboutContent = async (_req: Request, res: Response) => {
  let content = await AboutContent.findOne().populate(
    "updatedBy",
    "name email",
  );
  if (!content) {
    // Create default on first access
    content = await AboutContent.create({});
    content = await content.populate("updatedBy", "name email");
  }
  res.locals.data = content;
};

// PUT - Update the about page content (upsert)
export const updateAboutContent = async (req: Request, res: Response) => {
  const {
    heroBadge,
    heroTitle,
    heroHighlight,
    heroSubtitle,
    stats,
    missionTitle,
    missionText,
    visionTitle,
    visionText,
    valuesHeading,
    valuesSubheading,
    coreValues,
    storyTitle,
    storyParagraphs,
  } = req.body;

  const adminId = (req as any).admin?._id || (req as any).admin?.id;

  const update: Record<string, any> = {};
  if (heroBadge !== undefined) update.heroBadge = heroBadge;
  if (heroTitle !== undefined) update.heroTitle = heroTitle;
  if (heroHighlight !== undefined) update.heroHighlight = heroHighlight;
  if (heroSubtitle !== undefined) update.heroSubtitle = heroSubtitle;
  if (stats !== undefined) update.stats = stats;
  if (missionTitle !== undefined) update.missionTitle = missionTitle;
  if (missionText !== undefined) update.missionText = missionText;
  if (visionTitle !== undefined) update.visionTitle = visionTitle;
  if (visionText !== undefined) update.visionText = visionText;
  if (valuesHeading !== undefined) update.valuesHeading = valuesHeading;
  if (valuesSubheading !== undefined)
    update.valuesSubheading = valuesSubheading;
  if (coreValues !== undefined) update.coreValues = coreValues;
  if (storyTitle !== undefined) update.storyTitle = storyTitle;
  if (storyParagraphs !== undefined) update.storyParagraphs = storyParagraphs;
  if (adminId) update.updatedBy = adminId;

  const content = await AboutContent.findOneAndUpdate({}, update, {
    returnDocument: "after",
    upsert: true,
    runValidators: true,
  }).populate("updatedBy", "name email");

  await invalidateCache("/v1/api/about");
  res.locals.data = content;
};
