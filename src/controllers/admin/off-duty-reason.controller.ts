import { Request, Response, NextFunction } from "express";
import OffDutyReason from "../../models/off-duty-reason.model";

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { isActive, search } = req.query;
  const q: any = {};
  if (typeof isActive === "string") q.isActive = isActive === "true";
  if (typeof search === "string" && search.trim()) {
    q.label = { $regex: search.trim(), $options: "i" };
  }
  const items = await OffDutyReason.find(q)
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  req.rData = { items, total: items.length };
  req.msg = "off_duty_reasons_listed";
  next();
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { label, isActive = true, sortOrder = 0 } = req.body;
  if (!label || typeof label !== "string" || !label.trim()) {
    return res
      .status(400)
      .json({ rCode: 0, rMsg: "label_required", rData: {} });
  }
  const adminId = (req as any).adminUser?._id;
  try {
    const item = await OffDutyReason.create({
      label: label.trim(),
      isActive: !!isActive,
      sortOrder: Number(sortOrder) || 0,
      createdByAdminId: adminId,
    });
    req.rData = { item };
    req.msg = "off_duty_reason_created";
    next();
  } catch (err: any) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ rCode: 0, rMsg: "duplicate_label", rData: {} });
    }
    throw err;
  }
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const patch: any = {};
  if (typeof req.body.label === "string") patch.label = req.body.label.trim();
  if (typeof req.body.isActive === "boolean") patch.isActive = req.body.isActive;
  if (req.body.sortOrder !== undefined)
    patch.sortOrder = Number(req.body.sortOrder) || 0;

  try {
    const item = await OffDutyReason.findByIdAndUpdate(id, patch, {
      returnDocument: "after",
    }).lean();
    if (!item) {
      return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
    }
    req.rData = { item };
    req.msg = "off_duty_reason_updated";
    next();
  } catch (err: any) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ rCode: 0, rMsg: "duplicate_label", rData: {} });
    }
    throw err;
  }
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const item = await OffDutyReason.findByIdAndDelete(id).lean();
  if (!item) {
    return res.status(404).json({ rCode: 0, rMsg: "not_found", rData: {} });
  }
  req.rData = {};
  req.msg = "off_duty_reason_deleted";
  next();
};
