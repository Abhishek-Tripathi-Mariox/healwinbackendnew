import { Request, Response } from "express";
import { Designation } from "../../models/designation.model";
import { paginate } from "../../utils/paginate.util";

export const getAllDesignations = async (req: Request, res: Response) => {
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
  const result = await paginate(Designation, filter, req, {
    sortOrder: 1,
    name: 1,
  });
  res.locals.data = result;
};

export const getDesignationById = async (req: Request, res: Response) => {
  const designation = await Designation.findById(req.params.id);
  if (!designation)
    return res
      .status(404)
      .json({ success: false, message: "Designation not found" });
  res.locals.data = designation;
};

export const createDesignation = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body;
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Designation name is required" });
  }
  const existing = await Designation.findOne({
    name: { $regex: `^${name}$`, $options: "i" },
  });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "Designation already exists" });
  }
  const designation = await Designation.create({
    name,
    description: description || "",
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  res.locals.data = designation;
};

export const updateDesignation = async (req: Request, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const designation = await Designation.findByIdAndUpdate(
    req.params.id,
    update,
    { returnDocument: "after" },
  );
  if (!designation)
    return res
      .status(404)
      .json({ success: false, message: "Designation not found" });
  res.locals.data = designation;
};

export const deleteDesignation = async (req: Request, res: Response) => {
  const designation = await Designation.findByIdAndDelete(req.params.id);
  if (!designation)
    return res
      .status(404)
      .json({ success: false, message: "Designation not found" });
  res.locals.data = { message: "Designation deleted" };
};
