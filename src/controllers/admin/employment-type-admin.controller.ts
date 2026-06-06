import { Request, Response } from "express";
import { EmploymentType } from "../../models/employment-type.model";
import { paginate } from "../../utils/paginate.util";

export const getAllEmploymentTypes = async (req: Request, res: Response) => {
  const { status, q } = req.query as { status?: string; q?: string };
  const filter: Record<string, any> = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }
  const result = await paginate(EmploymentType, filter, req, {
    sortOrder: 1,
    name: 1,
  });
  res.locals.data = result;
};

export const getEmploymentTypeById = async (req: Request, res: Response) => {
  const type = await EmploymentType.findById(req.params.id);
  if (!type)
    return res
      .status(404)
      .json({ success: false, message: "Employment type not found" });
  res.locals.data = type;
};

export const createEmploymentType = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body;
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Employment type name is required" });
  }
  const existing = await EmploymentType.findOne({
    name: { $regex: `^${name}$`, $options: "i" },
  });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "Employment type already exists" });
  }
  const type = await EmploymentType.create({
    name,
    description: description || "",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  res.locals.data = type;
};

export const updateEmploymentType = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const type = await EmploymentType.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!type)
    return res
      .status(404)
      .json({ success: false, message: "Employment type not found" });
  res.locals.data = type;
};

export const deleteEmploymentType = async (req: Request, res: Response) => {
  const type = await EmploymentType.findByIdAndDelete(req.params.id);
  if (!type)
    return res
      .status(404)
      .json({ success: false, message: "Employment type not found" });
  res.locals.data = { message: "Employment type deleted" };
};
