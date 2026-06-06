import { Request, Response } from "express";
import { SOSAlert } from "../../models/sos.model";
import { Centre } from "../../models/centre.model";
import { Service } from "../../models/service.model";
import { TeamMember } from "../../models/team-member.model";
import { Career } from "../../models/career.model";
import { NewsArticle } from "../../models/news-article.model";
import { State } from "../../models/state.model";
import { District } from "../../models/district.model";

/**
 * Admin dashboard stats — high-level counts for the landing dashboard.
 * Shape matches admin/src/pages/Dashboard.tsx exactly. Counts run in
 * parallel for speed.
 */
export const getStats = async (_req: Request, res: Response) => {
  const [
    totalSosAlerts,
    activeCentres,
    totalServices,
    teamMembers,
    activeJobs,
    newsArticles,
    totalStates,
    totalDistricts,
  ] = await Promise.all([
    SOSAlert.countDocuments(),
    Centre.countDocuments({ isActive: true }),
    Service.countDocuments({ isActive: true }),
    TeamMember.countDocuments({ isActive: true }),
    Career.countDocuments({ isActive: true }),
    NewsArticle.countDocuments({ isPublished: true }),
    State.countDocuments(),
    District.countDocuments(),
  ]);

  res.locals.data = {
    totalSosAlerts,
    activeCentres,
    totalServices,
    teamMembers,
    activeJobs,
    newsArticles,
    totalStates,
    totalDistricts,
  };
};
