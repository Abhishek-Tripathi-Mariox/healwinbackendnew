import { Request, Response } from "express";
import { EmploymentType } from "../../models/employment-type.model";
import { paginate } from "../../utils/paginate.util";
import { escapeRegex } from "../../utils/helpers";

export const getAllEmploymentTypes = async (req: Request, res: Response) => {
  const { status, q, engagement } = req.query as { status?: string; q?: string; engagement?: string };
  const filter: Record<string, any> = {};
  if (engagement === "payroll" || engagement === "contract") filter.engagement = engagement;
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (q) {
    filter.$or = [
      { name: { $regex: escapeRegex(q), $options: "i" } },
      { description: { $regex: escapeRegex(q), $options: "i" } },
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

const ENGAGEMENTS = ["payroll", "contract"];

export const createEmploymentType = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder, engagement } = req.body;
  if (engagement !== undefined && !ENGAGEMENTS.includes(engagement)) {
    return res.status(400).json({ success: false, message: "Engagement must be payroll or contract" });
  }
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Employment type name is required" });
  }
  const existing = await EmploymentType.findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "Employment type already exists" });
  }
  const type = await EmploymentType.create({
    name,
    description: description || "",
    engagement: engagement || "payroll",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  res.locals.data = type;
};

export const updateEmploymentType = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder, engagement } = req.body;
  if (engagement !== undefined && !ENGAGEMENTS.includes(engagement)) {
    return res.status(400).json({ success: false, message: "Engagement must be payroll or contract" });
  }
  const update: Record<string, any> = {};
  if (engagement !== undefined) update.engagement = engagement;
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
