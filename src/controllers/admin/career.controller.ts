import { Request, Response } from "express";
import { Career } from "../../models/career.model";
import { paginate } from "../../utils/paginate.util";
import { invalidateCache } from "../../middlewares/cache.middleware";

export const getDepartments = async (_req: Request, res: Response) => {
  const departments = await Career.distinct("department");
  res.locals.data = departments.filter(Boolean).sort();
};

export const getLocations = async (_req: Request, res: Response) => {
  const locations = await Career.distinct("location");
  res.locals.data = locations.filter(Boolean).sort();
};

export const getTypes = async (_req: Request, res: Response) => {
  const types = await Career.distinct("type");
  res.locals.data = types.filter(Boolean).sort();
};

export const getAllCareers = async (req: Request, res: Response) => {
  const { status, q, department } = req.query as {
    status?: string;
    q?: string;
    department?: string;
  };
  const filter: Record<string, any> = {};

  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (department) filter.department = department;

  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { department: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(
    Career,
    filter,
    req,
    { postedAt: -1, createdAt: -1 },
    ["states", { path: "districts", select: "name state" }],
  );
  res.locals.data = result;
};

export const getCareerById = async (req: Request, res: Response) => {
  const career = await Career.findById(req.params.id)
    .populate("states", "name code")
    .populate("districts", "name state");
  if (!career) {
    return res
      .status(404)
      .json({ success: false, message: "Career not found" });
  }
  res.locals.data = career;
};

export const createCareer = async (req: Request, res: Response) => {
  const {
    title,
    department,
    location,
    type,
    experience,
    salary,
    qualification,
    rolesAndResponsibilities,
    states,
    districts,
    cardColor,
    isActive,
    postedAt,
  } = req.body;

  if (!title || !department || !type || !experience || !qualification) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  const career = await Career.create({
    title,
    department,
    location: location || "",
    type,
    experience,
    salary,
    qualification,
    rolesAndResponsibilities: Array.isArray(rolesAndResponsibilities)
      ? rolesAndResponsibilities
      : typeof rolesAndResponsibilities === "string"
        ? rolesAndResponsibilities
            .split("\n")
            .map((r) => r.trim())
            .filter(Boolean)
        : [],
    states: Array.isArray(states) ? states : [],
    districts: Array.isArray(districts) ? districts : [],
    cardColor: cardColor || "#2563eb",
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    postedAt: postedAt ? new Date(postedAt) : new Date(),
  });

  await invalidateCache("/v1/api/careers");
  res.locals.data = career;
};

export const updateCareer = async (req: Request, res: Response) => {
  const {
    title,
    department,
    location,
    type,
    experience,
    salary,
    qualification,
    rolesAndResponsibilities,
    states,
    districts,
    cardColor,
    isActive,
    postedAt,
  } = req.body;

  const update: Record<string, any> = {
    title,
    department,
    location,
    type,
    experience,
    salary,
    qualification,
  };

  if (rolesAndResponsibilities !== undefined) {
    update.rolesAndResponsibilities = Array.isArray(rolesAndResponsibilities)
      ? rolesAndResponsibilities
      : typeof rolesAndResponsibilities === "string"
        ? rolesAndResponsibilities
            .split("\n")
            .map((r) => r.trim())
            .filter(Boolean)
        : [];
  }
  if (states !== undefined) update.states = Array.isArray(states) ? states : [];
  if (districts !== undefined)
    update.districts = Array.isArray(districts) ? districts : [];
  if (cardColor !== undefined) update.cardColor = cardColor;
  if (isActive !== undefined) update.isActive = Boolean(isActive);
  if (postedAt !== undefined)
    update.postedAt = postedAt ? new Date(postedAt) : null;

  const career = await Career.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  })
    .populate("states", "name code")
    .populate("districts", "name state");

  if (!career) {
    return res
      .status(404)
      .json({ success: false, message: "Career not found" });
  }

  await invalidateCache("/v1/api/careers");
  res.locals.data = career;
};

export const deleteCareer = async (req: Request, res: Response) => {
  const career = await Career.findByIdAndDelete(req.params.id);
  if (!career) {
    return res
      .status(404)
      .json({ success: false, message: "Career not found" });
  }
  res.locals.data = { message: "Career deleted" };
  await invalidateCache("/v1/api/careers");
};
