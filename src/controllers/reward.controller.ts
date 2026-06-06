import { Request, Response, NextFunction } from "express";
import * as RewardService from "../services/reward.service";

export const getRewards = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req as any).userId;

  const data = await RewardService.getRewards(userId);

  req.rData = data;
  req.msg = "success";
  next();
};
