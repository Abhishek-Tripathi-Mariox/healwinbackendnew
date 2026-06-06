import { Request, Response } from "express";
import { LogoSettings } from "../../models/logo-settings.model";
import { uploadFileToAws } from "../../utils/s3";
import { invalidateCache } from "../../middlewares/cache.middleware";

export const getLogoSettings = async (_req: Request, res: Response) => {
  let settings = await LogoSettings.findOne();
  if (!settings) {
    settings = await LogoSettings.create({});
  }
  res.locals.data = settings;
};

export const updateLogoSettings = async (req: Request, res: Response) => {
  const files = req.files as
    | { [field: string]: Express.Multer.File[] }
    | undefined;

  const update: Record<string, any> = {};

  if (files?.titleLogo?.[0]) {
    const result = await uploadFileToAws([files.titleLogo[0]]);
    update.titleLogo = result.images as string;
  }

  if (files?.mainLogo?.[0]) {
    const result = await uploadFileToAws([files.mainLogo[0]]);
    update.mainLogo = result.images as string;
  }

  // Allow clearing logos
  if (req.body.titleLogo === "") update.titleLogo = "";
  if (req.body.mainLogo === "") update.mainLogo = "";

  if (typeof req.body.sosDispatchNumber === "string") {
    update.sosDispatchNumber = req.body.sosDispatchNumber.trim();
  }

  let settings = await LogoSettings.findOne();
  if (!settings) {
    settings = await LogoSettings.create(update);
  } else {
    settings = await LogoSettings.findByIdAndUpdate(settings._id, update, {
      returnDocument: "after",
    });
  }

  await invalidateCache("/v1/api/logo");
  res.locals.data = settings;
};
