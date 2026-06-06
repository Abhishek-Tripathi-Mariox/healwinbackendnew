import { Request, Response } from "express";
import { HomeContent } from "../../models/home-content.model";
import { uploadFileToAws } from "../../utils/s3";
import { invalidateCache } from "../../middlewares/cache.middleware";

// GET /admin/home-content — Get homepage content (singleton)
export const getHomeContent = async (_req: Request, res: Response) => {
  let content = await HomeContent.findOne().populate("updatedBy", "name email");
  if (!content) {
    content = await HomeContent.create({});
    content = await content.populate("updatedBy", "name email");
  }
  res.locals.data = content;
};

// PUT /admin/home-content — Update homepage content (upsert)
export const updateHomeContent = async (req: Request, res: Response) => {
  // When sent as multipart/form-data the JSON fields arrive as strings.
  // Parse the "data" envelope if present, otherwise fall back to req.body.
  const body: Record<string, any> =
    typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;

  const {
    // Hero
    heroBadge,
    heroTitle,
    heroHighlight,
    heroSubtitle,
    heroStats,
    heroCtaButtons,
    heroFloatingCards,
    // Services
    servicesBadge,
    servicesTitle,
    servicesHighlight,
    servicesSubtitle,
    servicesCount,
    // Actions
    actionsBadge,
    actionsTitle,
    actionsHighlight,
    actionsSubtitle,
    actionsScenes,
    actionsBottomText,
    // Mobile App
    appBadge,
    appTitle,
    appHighlight,
    appSubtitle,
    appFeatures,
    appStoreUrl,
    playStoreUrl,
    // Why HealWin
    whyBadge,
    whyTitle,
    whyHighlight,
    whySubtitle,
    whyReasons,
    // CTA
    ctaBadge,
    ctaTitle,
    ctaHighlight,
    ctaSubtitle,
    ctaButtons,
    ctaTrustIndicators,
  } = body;

  const adminId = (req as any).admin?._id || (req as any).admin?.id;

  const update: Record<string, any> = {};

  // Hero
  if (heroBadge !== undefined) update.heroBadge = heroBadge;
  if (heroTitle !== undefined) update.heroTitle = heroTitle;
  if (heroHighlight !== undefined) update.heroHighlight = heroHighlight;
  if (heroSubtitle !== undefined) update.heroSubtitle = heroSubtitle;

  // Handle file uploads (heroImage, appMockupImage)
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;
  if (files?.heroImage?.[0]) {
    const uploadResult = await uploadFileToAws([files.heroImage[0]]);
    update.heroImage = uploadResult.images as string;
  }
  if (files?.appMockupImage?.[0]) {
    const uploadResult = await uploadFileToAws([files.appMockupImage[0]]);
    update.appMockupImage = uploadResult.images as string;
  }

  if (heroStats !== undefined) update.heroStats = heroStats;
  if (heroCtaButtons !== undefined) update.heroCtaButtons = heroCtaButtons;
  if (heroFloatingCards !== undefined)
    update.heroFloatingCards = heroFloatingCards;

  // Services
  if (servicesBadge !== undefined) update.servicesBadge = servicesBadge;
  if (servicesTitle !== undefined) update.servicesTitle = servicesTitle;
  if (servicesHighlight !== undefined)
    update.servicesHighlight = servicesHighlight;
  if (servicesSubtitle !== undefined)
    update.servicesSubtitle = servicesSubtitle;
  if (servicesCount !== undefined) update.servicesCount = servicesCount;

  // Actions
  if (actionsBadge !== undefined) update.actionsBadge = actionsBadge;
  if (actionsTitle !== undefined) update.actionsTitle = actionsTitle;
  if (actionsHighlight !== undefined)
    update.actionsHighlight = actionsHighlight;
  if (actionsSubtitle !== undefined) update.actionsSubtitle = actionsSubtitle;
  if (actionsScenes !== undefined) update.actionsScenes = actionsScenes;
  if (actionsBottomText !== undefined)
    update.actionsBottomText = actionsBottomText;

  // Mobile App
  if (appBadge !== undefined) update.appBadge = appBadge;
  if (appTitle !== undefined) update.appTitle = appTitle;
  if (appHighlight !== undefined) update.appHighlight = appHighlight;
  if (appSubtitle !== undefined) update.appSubtitle = appSubtitle;
  if (appFeatures !== undefined) update.appFeatures = appFeatures;
  if (appStoreUrl !== undefined) update.appStoreUrl = appStoreUrl;
  if (playStoreUrl !== undefined) update.playStoreUrl = playStoreUrl;

  // Why HealWin
  if (whyBadge !== undefined) update.whyBadge = whyBadge;
  if (whyTitle !== undefined) update.whyTitle = whyTitle;
  if (whyHighlight !== undefined) update.whyHighlight = whyHighlight;
  if (whySubtitle !== undefined) update.whySubtitle = whySubtitle;
  if (whyReasons !== undefined) update.whyReasons = whyReasons;

  // CTA
  if (ctaBadge !== undefined) update.ctaBadge = ctaBadge;
  if (ctaTitle !== undefined) update.ctaTitle = ctaTitle;
  if (ctaHighlight !== undefined) update.ctaHighlight = ctaHighlight;
  if (ctaSubtitle !== undefined) update.ctaSubtitle = ctaSubtitle;
  if (ctaButtons !== undefined) update.ctaButtons = ctaButtons;
  if (ctaTrustIndicators !== undefined)
    update.ctaTrustIndicators = ctaTrustIndicators;

  if (adminId) update.updatedBy = adminId;

  const content = await HomeContent.findOneAndUpdate({}, update, {
    returnDocument: "after",
    upsert: true,
    runValidators: true,
  }).populate("updatedBy", "name email");

  await invalidateCache("/v1/api/home-content");
  res.locals.data = content;
};
