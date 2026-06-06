import { Request, Response } from "express";
import { Department } from "../../models/department.model";
import { paginate } from "../../utils/paginate.util";

export const getAllDepartments = async (req: Request, res: Response) => {
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
  const result = await paginate(Department, filter, req, {
    sortOrder: 1,
    name: 1,
  });
  res.locals.data = result;
};

export const getDepartmentById = async (req: Request, res: Response) => {
  const department = await Department.findById(req.params.id);
  if (!department)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });
  res.locals.data = department;
};

export const createDepartment = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body;
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Department name is required" });
  }
  const existing = await Department.findOne({
    name: { $regex: `^${name}$`, $options: "i" },
  });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "Department already exists" });
  }
  const department = await Department.create({
    name,
    description: description || "",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  res.locals.data = department;
};

export const updateDepartment = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const department = await Department.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!department)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });
  res.locals.data = department;
};

export const deleteDepartment = async (req: Request, res: Response) => {
  const department = await Department.findByIdAndDelete(req.params.id);
  if (!department)
    return res
      .status(404)
      .json({ success: false, message: "Department not found" });
  res.locals.data = { message: "Department deleted" };
};
