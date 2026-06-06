import { Request, Response, NextFunction } from "express";
import * as GSTService from "../services/gst.service";

export const addOrUpdateGST = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req as any).userId;
  const { gstin, businessName } = req.body;

  if (!gstin) {
    req.rCode = 0;
    req.msg = "gstin_required";
    return next();
  }

  const gst = await GSTService.upsertGST(userId, gstin, businessName);

  req.rData = gst;
  req.msg = "success";
  next();
};

export const getGST = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req as any).userId;
  const gst = await GSTService.getGST(userId);

  req.rData = gst;
  req.msg = "success";
  next();
};
