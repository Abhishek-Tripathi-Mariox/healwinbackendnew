import { Request, Response, NextFunction } from "express";
import { SOSAlert } from "../../models/sos.model";

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { status, page = "1", limit = "20" } = req.query as any;
  const filter: any = {};
  if (status) filter.status = status;

  const pg = Math.max(1, parseInt(page as string, 10));
  const lim = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

  const [items, total] = await Promise.all([
    SOSAlert.find(filter)
      .populate("userId", "firstName lastName email phone")
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    SOSAlert.countDocuments(filter),
  ]);

  req.rData = { items, total, page: pg, limit: lim };
  req.msg = "sos_alerts_listed";
  next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const alert = await SOSAlert.findById(req.params.id)
    .populate("userId", "firstName lastName email phone")
    .lean();
  if (!alert) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { alert };
  req.msg = "sos_alert_detail";
  next();
};

/** POST /sos-alerts/:id/status — control centre responds/resolves an alert. */
export const updateStatus = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const status = String(req.body?.status || "").toUpperCase();
  const allowed = ["ACTIVE", "RESPONDED", "RESOLVED", "FALSE_ALARM"];
  if (!allowed.includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `status one of ${allowed.join(", ")}` };
    return next();
  }
  const set: any = { status };
  const adminId = (req as any).admin?._id;
  if (status === "RESPONDED") { set.respondedBy = adminId; set.respondedAt = new Date(); }
  if (status === "RESOLVED" || status === "FALSE_ALARM") {
    set.resolvedAt = new Date();
    if (req.body?.resolutionNotes) set.resolutionNotes = req.body.resolutionNotes;
  }
  const alert = await SOSAlert.findByIdAndUpdate(req.params.id as string, { $set: set }, { new: true }).lean();
  if (!alert) { req.rCode = 5; req.msg = "not_found"; req.rData = {}; return next(); }
  req.rData = { alert };
  req.msg = "sos_alert_updated";
  return next();
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // For seeding / testing: accept {lat, lng, address?, triggeredBy?, userId?}
  const { lat, lng, address, triggeredBy = "USER", userId } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    req.rCode = 0;
    req.msg = "lat_lng_required";
    req.rData = {};
    return next();
  }
  const alert = await SOSAlert.create({
    triggeredBy,
    userId,
    location: { type: "Point", coordinates: [lng, lat] },
    address,
    status: "ACTIVE",
  });
  req.rData = { alert };
  req.msg = "sos_alert_created";
  next();
};
