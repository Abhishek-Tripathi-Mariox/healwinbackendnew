import { Request, Response } from "express";
import { TeamMember } from "../models/team-member.model";

export const listTeamMembers = async (_req: Request, res: Response) => {
  const members = await TeamMember.find({ isActive: true })
    .select("-__v")
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = members;
};

export const getTeamMember = async (req: Request, res: Response) => {
  const member = await TeamMember.findOne({
    _id: req.params.id,
    isActive: true,
  });
  if (!member) {
    return res
      .status(404)
      .json({ success: false, message: "Team member not found" });
  }
  res.locals.data = member;
};

/* Public profile lookup by uniqueId — for QR verification */
export const getTeamMemberByUniqueId = async (req: Request, res: Response) => {
  const member = await TeamMember.findOne({
    uniqueId: req.params.uniqueId,
    isActive: true,
  });
  if (!member) {
    return res
      .status(404)
      .json({ success: false, message: "Team member not found" });
  }
  res.locals.data = member;
};
