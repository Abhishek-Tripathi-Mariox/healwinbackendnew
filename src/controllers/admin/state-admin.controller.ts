import { Request, Response } from "express";
import { State } from "../../models/state.model";
import { paginate } from "../../utils/paginate.util";

export const getAllStates = async (req: Request, res: Response) => {
  const { status, q } = req.query as { status?: string; q?: string };
  const filter: Record<string, any> = {};
  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { code: { $regex: q, $options: "i" } },
    ];
  }
  const result = await paginate(State, filter, req, { sortOrder: 1, name: 1 });
  res.locals.data = result;
};

export const getStateById = async (req: Request, res: Response) => {
  const state = await State.findById(req.params.id);
  if (!state)
    return res.status(404).json({ success: false, message: "State not found" });
  res.locals.data = state;
};

export const createState = async (req: Request, res: Response) => {
  const { name, code, isActive, sortOrder } = req.body;
  if (!name || !code) {
    return res
      .status(400)
      .json({ success: false, message: "Name and code are required" });
  }
  const existing = await State.findOne({ code: code.toUpperCase() });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "State code already exists" });
  }
  const state = await State.create({
    name,
    code: code.toUpperCase(),
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  res.locals.data = state;
};

export const updateState = async (req: Request, res: Response) => {
  const { name, code, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (code !== undefined) {
    const existing = await State.findOne({
      code: code.toUpperCase(),
      _id: { $ne: (req.params.id as string) },
    });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "State code already exists" });
    update.code = code.toUpperCase();
  }
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const state = await State.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!state)
    return res.status(404).json({ success: false, message: "State not found" });
  res.locals.data = state;
};

export const deleteState = async (req: Request, res: Response) => {
  const state = await State.findByIdAndDelete(req.params.id);
  if (!state)
    return res.status(404).json({ success: false, message: "State not found" });
  res.locals.data = { message: "State deleted" };
};
