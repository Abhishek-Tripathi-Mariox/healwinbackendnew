import { Request, Response, NextFunction } from "express";
import AmbulanceServiceProvider from "../../models/ambulance-service-provider.model";
import Ambulance from "../../models/ambulance.model";

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const adminId = req.adminId;
  const provider = await AmbulanceServiceProvider.create({
    ...req.body,
    createdByAdminId: adminId,
  });
  req.rData = { provider };
  req.msg = "provider_created";
  next();
};

export const list = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const {
    state,
    district,
    isActive,
    search,
    page = "1",
    limit = "20",
  } = req.query as any;
  const filter: any = {};
  if (state) filter.state = state;
  if (district) filter.district = district;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (search) filter.$text = { $search: String(search) };

  const pg = Math.max(1, parseInt(page as string, 10));
  const lim = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

  const [items, total] = await Promise.all([
    AmbulanceServiceProvider.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    AmbulanceServiceProvider.countDocuments(filter),
  ]);

  req.rData = { items, total, page: pg, limit: lim };
  req.msg = "providers_listed";
  next();
};

export const detail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const provider = await AmbulanceServiceProvider.findById(
    req.params.id,
  ).lean();
  if (!provider) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  const ambulanceCount = await Ambulance.countDocuments({
    providerId: provider._id,
    isActive: true,
  });
  req.rData = { provider, ambulanceCount };
  req.msg = "provider_detail";
  next();
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const provider = await AmbulanceServiceProvider.findByIdAndUpdate(
    req.params.id,
    req.body,
    { returnDocument: "after" },
  );
  if (!provider) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { provider };
  req.msg = "provider_updated";
  next();
};

export const softDelete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const activeAmbulances = await Ambulance.countDocuments({
    providerId: req.params.id,
    isActive: true,
  });
  if (activeAmbulances > 0) {
    req.rCode = 0;
    req.msg = "provider_has_active_ambulances";
    req.rData = { activeAmbulances };
    return next();
  }
  const provider = await AmbulanceServiceProvider.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { returnDocument: "after" },
  );
  if (!provider) {
    req.rCode = 5;
    req.msg = "not_found";
    req.rData = {};
    return next();
  }
  req.rData = { provider };
  req.msg = "provider_deleted";
  next();
};
