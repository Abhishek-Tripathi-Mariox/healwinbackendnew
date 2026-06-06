import { Request, Response } from "express";
import { Division } from "../../models/division.model";
import { paginate } from "../../utils/paginate.util";

export const getAllDivisions = async (req: Request, res: Response) => {
  const { status, q, district } = req.query as {
    status?: string;
    q?: string;
    district?: string;
  };
  const filter: Record<string, any> = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (district) filter.district = district;
  if (q) {
    filter.$or = [{ name: { $regex: q, $options: "i" } }];
  }
  const result = await paginate(
    Division,
    filter,
    req,
    { sortOrder: 1, name: 1 },
    [
      {
        path: "district",
        select: "name state",
        populate: { path: "state", select: "name code" },
      },
    ],
  );
  res.locals.data = result;
};

export const getDivisionById = async (req: Request, res: Response) => {
  const division = await Division.findById(req.params.id).populate({
    path: "district",
    select: "name state",
    populate: { path: "state", select: "name code" },
  });
  if (!division)
    return res
      .status(404)
      .json({ success: false, message: "Division not found" });
  res.locals.data = division;
};

export const createDivision = async (req: Request, res: Response) => {
  const { name, district, isActive, sortOrder } = req.body;
  if (!name || !district) {
    return res
      .status(400)
      .json({ success: false, message: "Name and district are required" });
  }
  const existing = await Division.findOne({
    name: { $regex: `^${name}$`, $options: "i" },
    district,
  });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Division already exists in this district",
    });
  }
  const division = await Division.create({
    name,
    district,
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  const populated = await division.populate({
    path: "district",
    select: "name state",
    populate: { path: "state", select: "name code" },
  });
  res.locals.data = populated;
};

export const updateDivision = async (req: Request, res: Response) => {
  const { name, district, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (district !== undefined) update.district = district;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const division = await Division.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  }).populate({
    path: "district",
    select: "name state",
    populate: { path: "state", select: "name code" },
  });
  if (!division)
    return res
      .status(404)
      .json({ success: false, message: "Division not found" });
  res.locals.data = division;
};

export const deleteDivision = async (req: Request, res: Response) => {
  const division = await Division.findByIdAndDelete(req.params.id);
  if (!division)
    return res
      .status(404)
      .json({ success: false, message: "Division not found" });
  res.locals.data = { message: "Division deleted" };
};
