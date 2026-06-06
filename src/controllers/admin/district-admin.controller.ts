import { Request, Response } from "express";
import { District } from "../../models/district.model";
import { paginate } from "../../utils/paginate.util";

export const getAllDistricts = async (req: Request, res: Response) => {
  const { status, q, state } = req.query as {
    status?: string;
    q?: string;
    state?: string;
  };
  const filter: Record<string, any> = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (state) filter.state = state;
  if (q) {
    filter.$or = [{ name: { $regex: q, $options: "i" } }];
  }
  const result = await paginate(
    District,
    filter,
    req,
    { sortOrder: 1, name: 1 },
    [{ path: "state", select: "name code" }],
  );
  res.locals.data = result;
};

export const getDistrictById = async (req: Request, res: Response) => {
  const district = await District.findById(req.params.id).populate(
    "state",
    "name code",
  );
  if (!district)
    return res
      .status(404)
      .json({ success: false, message: "District not found" });
  res.locals.data = district;
};

export const createDistrict = async (req: Request, res: Response) => {
  const { name, state, isActive, sortOrder } = req.body;
  if (!name || !state) {
    return res
      .status(400)
      .json({ success: false, message: "Name and state are required" });
  }
  const existing = await District.findOne({
    name: { $regex: `^${name}$`, $options: "i" },
    state,
  });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "District already exists in this state",
    });
  }
  const district = await District.create({
    name,
    state,
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  const populated = await district.populate("state", "name code");
  res.locals.data = populated;
};

export const updateDistrict = async (req: Request, res: Response) => {
  const { name, state, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (state !== undefined) update.state = state;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const district = await District.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  }).populate("state", "name code");
  if (!district)
    return res
      .status(404)
      .json({ success: false, message: "District not found" });
  res.locals.data = district;
};

export const deleteDistrict = async (req: Request, res: Response) => {
  const district = await District.findByIdAndDelete(req.params.id);
  if (!district)
    return res
      .status(404)
      .json({ success: false, message: "District not found" });
  res.locals.data = { message: "District deleted" };
};
