import { Request, Response } from "express";
import { City } from "../../models/city.model";

export const getAllCities = async (req: Request, res: Response) => {
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
  const cities = await City.find(filter)
    .populate("state", "name code")
    .sort({ sortOrder: 1, name: 1 });
  res.locals.data = cities;
};

export const getCityById = async (req: Request, res: Response) => {
  const city = await City.findById(req.params.id).populate(
    "state",
    "name code",
  );
  if (!city)
    return res.status(404).json({ success: false, message: "City not found" });
  res.locals.data = city;
};

export const createCity = async (req: Request, res: Response) => {
  const { name, state, isActive, sortOrder } = req.body;
  if (!name || !state) {
    return res
      .status(400)
      .json({ success: false, message: "Name and state are required" });
  }
  const existing = await City.findOne({
    name: { $regex: `^${name}$`, $options: "i" },
    state,
  });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "City already exists in this state" });
  }
  const city = await City.create({
    name,
    state,
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
  });
  const populated = await city.populate("state", "name code");
  res.locals.data = populated;
};

export const updateCity = async (req: Request, res: Response) => {
  const { name, state, isActive, sortOrder } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (state !== undefined) update.state = state;
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;
  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

  const city = await City.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  }).populate("state", "name code");
  if (!city)
    return res.status(404).json({ success: false, message: "City not found" });
  res.locals.data = city;
};

export const deleteCity = async (req: Request, res: Response) => {
  const city = await City.findByIdAndDelete(req.params.id);
  if (!city)
    return res.status(404).json({ success: false, message: "City not found" });
  res.locals.data = { message: "City deleted" };
};
