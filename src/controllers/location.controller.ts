import { Request, Response } from "express";
import { State } from "../models/state.model";
import { District } from "../models/district.model";
import { Division } from "../models/division.model";

// List all active states
export const listStates = async (_req: Request, res: Response) => {
  const states = await State.find({ isActive: true }).sort({
    sortOrder: 1,
    name: 1,
  });
  res.locals.data = states;
};

// List districts by state
export const listDistrictsByState = async (req: Request, res: Response) => {
  const { stateId } = req.params as Record<string, string>;
  const districts = await District.find({ state: stateId, isActive: true })
    .populate("state", "name code")
    .sort({ sortOrder: 1, name: 1 });
  res.locals.data = districts;
};

// List all active districts (optional state filter via query)
export const listDistricts = async (req: Request, res: Response) => {
  const { state } = req.query as { state?: string };
  const filter: Record<string, any> = { isActive: true };
  if (state) filter.state = state;
  const districts = await District.find(filter)
    .populate("state", "name code")
    .sort({ sortOrder: 1, name: 1 });
  res.locals.data = districts;
};

// List divisions by district
export const listDivisionsByDistrict = async (req: Request, res: Response) => {
  const { districtId } = req.params as Record<string, string>;
  const divisions = await Division.find({
    district: districtId,
    isActive: true,
  })
    .populate({
      path: "district",
      select: "name state",
      populate: { path: "state", select: "name code" },
    })
    .sort({ sortOrder: 1, name: 1 });
  res.locals.data = divisions;
};
