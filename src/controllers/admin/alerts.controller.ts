import { Request, Response, NextFunction } from "express";
import { computeHmsAlerts } from "../../services/hms-alerts.service";

/**
 * Doctor Panel / HMS operational alerts — low stock, expiring items, and due
 * OPD follow-ups. Surfaced in the admin header bell.
 */
export const getAlerts = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const data = await computeHmsAlerts();
  req.rData = data;
  req.msg = "alerts_listed";
  return next();
};
