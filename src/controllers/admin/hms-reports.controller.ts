import { Request, Response, NextFunction } from "express";
import { Appointment } from "../../models/appointment.model";
import { Admission } from "../../models/admission.model";
import { Bed } from "../../models/bed.model";
import { HospitalInvoice } from "../../models/hospital-invoice.model";
import { DiagnosticOrder } from "../../models/diagnostic-order.model";

/**
 * Hospital MIS — aggregated operational + financial metrics for the admin
 * dashboard: OPD volume, bed occupancy, ALOS, revenue (billed/paid/outstanding,
 * by section), diagnostics, and admission/discharge trend.
 */
export const summary = async (req: Request, _res: Response, next: NextFunction) => {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const since = new Date(now); since.setDate(since.getDate() - 30); since.setHours(0, 0, 0, 0);

  const [
    opdToday, opdByStatus,
    bedAgg, admittedNow,
    dischargedRecent,
    invoiceAgg, revenueBySection,
    diagByStatus,
    admitTrend, dischargeTrend,
  ] = await Promise.all([
    Appointment.countDocuments({ scheduledAt: { $gte: todayStart } }),
    Appointment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

    Bed.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Admission.countDocuments({ status: "admitted" }),

    Admission.find({ status: "discharged", dischargedAt: { $ne: null } })
      .select("admittedAt dischargedAt")
      .sort({ dischargedAt: -1 })
      .limit(200)
      .lean(),

    HospitalInvoice.aggregate([
      { $group: { _id: null, billed: { $sum: "$total" }, paid: { $sum: "$amountPaid" }, due: { $sum: "$balanceDue" } } },
    ]),
    HospitalInvoice.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.section", amount: { $sum: "$items.amount" } } },
      { $sort: { amount: -1 } },
    ]),

    DiagnosticOrder.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

    Admission.aggregate([
      { $match: { admittedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$admittedAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Admission.aggregate([
      { $match: { dischargedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$dischargedAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const bedCounts = { available: 0, occupied: 0, maintenance: 0 } as Record<string, number>;
  bedAgg.forEach((b: any) => { bedCounts[b._id] = b.count; });
  const totalBeds = bedCounts.available + bedCounts.occupied + bedCounts.maintenance;
  const occupancyPct = totalBeds > 0 ? Math.round((bedCounts.occupied / totalBeds) * 100) : 0;

  // Average length of stay (days) over recent discharges.
  let alos = 0;
  if (dischargedRecent.length > 0) {
    const totalDays = dischargedRecent.reduce((s: number, a: any) => {
      const ms = new Date(a.dischargedAt).getTime() - new Date(a.admittedAt).getTime();
      return s + Math.max(0, ms / 86400000);
    }, 0);
    alos = Math.round((totalDays / dischargedRecent.length) * 10) / 10;
  }

  const inv = invoiceAgg[0] || { billed: 0, paid: 0, due: 0 };

  req.rData = {
    opd: {
      today: opdToday,
      byStatus: opdByStatus.reduce((acc: any, s: any) => ({ ...acc, [s._id]: s.count }), {}),
    },
    ipd: {
      admittedNow,
      totalBeds,
      occupiedBeds: bedCounts.occupied,
      availableBeds: bedCounts.available,
      maintenanceBeds: bedCounts.maintenance,
      occupancyPct,
      alosDays: alos,
    },
    revenue: {
      billed: inv.billed || 0,
      paid: inv.paid || 0,
      outstanding: inv.due || 0,
      bySection: revenueBySection.map((r: any) => ({ section: r._id, amount: r.amount })),
    },
    diagnostics: diagByStatus.reduce((acc: any, s: any) => ({ ...acc, [s._id]: s.count }), {}),
    trends: {
      admissions: admitTrend.map((t: any) => ({ date: t._id, count: t.count })),
      discharges: dischargeTrend.map((t: any) => ({ date: t._id, count: t.count })),
    },
  };
  req.msg = "success";
  return next();
};
