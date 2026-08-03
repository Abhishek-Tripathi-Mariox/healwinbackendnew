import { Request, Response } from "express";
import { SOSAlert } from "../../models/sos.model";
import { Centre } from "../../models/centre.model";
import { Service } from "../../models/service.model";
import { TeamMember } from "../../models/team-member.model";
import { Career } from "../../models/career.model";
import { NewsArticle } from "../../models/news-article.model";
import { State } from "../../models/state.model";
import { District } from "../../models/district.model";
import { Appointment } from "../../models/appointment.model";
import { Bed } from "../../models/bed.model";
import { HospitalInvoice } from "../../models/hospital-invoice.model";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { unionCount, unionRevenueSum } from "./reports.controller";

/**
 * Admin dashboard stats — the landing page every admin sees first.
 *
 * Used to be CMS content counts only (SOS alerts, centres, services, team,
 * careers, news, states/districts) — none of it real operational data, so
 * an admin logging in saw no ambulance-ops, HMS, or staffing numbers at all
 * despite ~85 separate per-module dashboards existing elsewhere. Now also
 * pulls a real cross-module snapshot (today's ambulance rides + revenue —
 * reconciled across the legacy Booking and live AmbulanceRequest
 * collections, same as reports.controller.ts's dashboard; today's OPD +
 * bed occupancy + revenue; today's HR headcount/attendance) so this one
 * page is an actual "how's the hospital doing right now" view, with the
 * existing CMS counts kept alongside it (still real, just not operational).
 */
export const getStats = async (_req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalSosAlerts,
    activeCentres,
    totalServices,
    teamMembers,
    activeJobs,
    newsArticles,
    totalStates,
    totalDistricts,
    ridesToday,
    revenueToday,
    opdToday,
    bedAgg,
    invoiceAgg,
    headcount,
    presentToday,
    onLeaveToday,
  ] = await Promise.all([
    SOSAlert.countDocuments(),
    Centre.countDocuments({ isActive: true }),
    Service.countDocuments({ isActive: true }),
    TeamMember.countDocuments({ isActive: true }),
    Career.countDocuments({ isActive: true }),
    NewsArticle.countDocuments({ isPublished: true }),
    State.countDocuments(),
    District.countDocuments(),
    unionCount({ createdAt: { $gte: today } }),
    unionRevenueSum({ status: "COMPLETED", createdAt: { $gte: today } }),
    Appointment.countDocuments({ scheduledAt: { $gte: today, $lt: tomorrow } }),
    Bed.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    HospitalInvoice.aggregate([
      { $group: { _id: null, billed: { $sum: "$total" }, paid: { $sum: "$amountPaid" }, due: { $sum: "$balanceDue" } } },
    ]),
    HrEmployee.countDocuments({ isDeleted: false, status: "active" }),
    Attendance.countDocuments({ date: today, status: "present" }),
    Attendance.countDocuments({ date: today, status: "leave" }),
  ]);

  const bedCounts = { available: 0, occupied: 0, maintenance: 0 } as Record<string, number>;
  bedAgg.forEach((b: any) => { bedCounts[b._id] = b.count; });
  const totalBeds = bedCounts.available + bedCounts.occupied + bedCounts.maintenance;
  const inv = invoiceAgg[0] || { billed: 0, paid: 0, due: 0 };

  res.locals.data = {
    // Real cross-module snapshot — what makes this a hospital dashboard
    // rather than a CMS content dashboard.
    operations: {
      ambulance: { ridesToday, revenueToday },
      hms: {
        opdToday,
        occupancyPct: totalBeds > 0 ? Math.round((bedCounts.occupied / totalBeds) * 100) : 0,
        occupiedBeds: bedCounts.occupied,
        totalBeds,
        revenueBilled: inv.billed || 0,
        revenueOutstanding: inv.due || 0,
      },
      staff: { headcount, presentToday, onLeaveToday },
    },
    // Existing CMS content counts — unchanged.
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
