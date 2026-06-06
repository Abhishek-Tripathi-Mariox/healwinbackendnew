import { Request, Response } from "express";
import { TeamMember } from "../../models/team-member.model";
import { invalidateCache } from "../../middlewares/cache.middleware";
import { State } from "../../models/state.model";
import { uploadFileToAws } from "../../utils/s3";
import { paginate } from "../../utils/paginate.util";

export const getDivisions = async (_req: Request, res: Response) => {
  const divisions = await TeamMember.distinct("division");
  res.locals.data = divisions.filter(Boolean).sort();
};

export const getStates = async (_req: Request, res: Response) => {
  const states = await State.find({ isActive: true })
    .select("name code")
    .sort({ sortOrder: 1, name: 1 });
  res.locals.data = states;
};

export const getAllMembers = async (req: Request, res: Response) => {
  const { status, q, division, department } = req.query as {
    status?: string;
    q?: string;
    division?: string;
    department?: string;
  };
  const filter: Record<string, any> = {};

  if (status === "active") filter.isActive = true;
  if (status === "inactive") filter.isActive = false;
  if (division) filter.division = division;
  if (department) filter.department = department;

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { designation: { $regex: q, $options: "i" } },
      { division: { $regex: q, $options: "i" } },
      { department: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(TeamMember, filter, req, {
    sortOrder: 1,
    createdAt: -1,
  });
  res.locals.data = result;
};

export const getMemberById = async (req: Request, res: Response) => {
  const member = await TeamMember.findById(req.params.id);
  if (!member) {
    return res
      .status(404)
      .json({ success: false, message: "Team member not found" });
  }
  res.locals.data = member;
};

export const createMember = async (req: Request, res: Response) => {
  const {
    name,
    uniqueId,
    designation,
    division,
    department,
    state,
    email,
    phone,
    linkedin,
    bio,
    highlights,
    sortOrder,
    isActive,
  } = req.body;

  if (!name || !uniqueId || !designation) {
    return res.status(400).json({
      success: false,
      message: "Name, Employee ID, and Designation are required",
    });
  }

  // Check unique ID is unique
  const existing = await TeamMember.findOne({ uniqueId });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "This Unique ID is already in use",
    });
  }

  let imageUrl: string | undefined;
  const imageFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (imageFile) {
    const uploadResult = await uploadFileToAws([imageFile]);
    imageUrl = uploadResult.images as string;
  }

  const member = await TeamMember.create({
    name,
    uniqueId,
    designation,
    division,
    department,
    state,
    image: imageUrl || req.body.image || "",
    email,
    phone,
    linkedin,
    bio,
    highlights: Array.isArray(highlights)
      ? highlights
      : typeof highlights === "string"
        ? highlights
            .split("\n")
            .map((h: string) => h.trim())
            .filter(Boolean)
        : [],
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    isActive:
      isActive !== undefined ? isActive === "true" || isActive === true : true,
  });

  await invalidateCache("/v1/api/team");
  res.locals.data = member;
};

export const updateMember = async (req: Request, res: Response) => {
  const {
    name,
    uniqueId,
    designation,
    division,
    department,
    state,
    email,
    phone,
    linkedin,
    bio,
    highlights,
    sortOrder,
    isActive,
  } = req.body;

  const update: Record<string, any> = {};
  if (name !== undefined) update.name = name;
  if (uniqueId !== undefined) update.uniqueId = uniqueId;
  if (designation !== undefined) update.designation = designation;
  if (division !== undefined) update.division = division;
  if (department !== undefined) update.department = department;
  if (state !== undefined) update.state = state;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (linkedin !== undefined) update.linkedin = linkedin;
  if (bio !== undefined) update.bio = bio;

  if (highlights !== undefined) {
    update.highlights = Array.isArray(highlights)
      ? highlights
      : typeof highlights === "string"
        ? highlights
            .split("\n")
            .map((h: string) => h.trim())
            .filter(Boolean)
        : [];
  }

  if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);
  if (isActive !== undefined)
    update.isActive = isActive === "true" || isActive === true;

  // Handle image upload
  const imageFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (imageFile) {
    const uploadResult = await uploadFileToAws([imageFile]);
    update.image = uploadResult.images as string;
  } else if (req.body.image !== undefined) {
    update.image = req.body.image;
  }

  const member = await TeamMember.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
  });
  if (!member) {
    return res
      .status(404)
      .json({ success: false, message: "Team member not found" });
  }

  await invalidateCache("/v1/api/team");
  res.locals.data = member;
};

export const deleteMember = async (req: Request, res: Response) => {
  const member = await TeamMember.findByIdAndDelete(req.params.id);
  if (!member) {
    return res
      .status(404)
      .json({ success: false, message: "Team member not found" });
  }
  res.locals.data = { message: "Team member deleted" };
  await invalidateCache("/v1/api/team");
};
