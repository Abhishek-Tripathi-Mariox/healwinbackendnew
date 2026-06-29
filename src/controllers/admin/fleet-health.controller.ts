import { Request, Response, NextFunction } from "express";
import Ambulance from "../../models/ambulance.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import { EmergencyDispatch } from "../../models/emergency-dispatch.model";
import AmbulanceRequest from "../../models/ambulance-request.model";
import { SOSAlert } from "../../models/sos.model";

/**
 * Control-centre / Super-Admin fleet system-health snapshot: ambulance
 * availability, on-duty crew, live dispatch load, average response time and
 * active SOS — the operational pulse of the network.
 */
export const summary = async (req: Request, _res: Response, next: NextFunction) => {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24h

  const [ambAgg, onDutyCrew, activeDispatches, activeRequests, activeSos, recent] =
    await Promise.all([
      Ambulance.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      AmbulanceStaff.countDocuments({ isDutyOn: true, isDeleted: { $ne: true } }),
      EmergencyDispatch.countDocuments({ status: { $in: ["DISPATCHED", "ACKNOWLEDGED", "EN_ROUTE", "ON_SCENE", "ON_TRIP"] } }),
      AmbulanceRequest.countDocuments({ status: { $in: ["SEARCHING", "ASSIGNED", "ARRIVED", "ON_TRIP"] } }),
      SOSAlert.countDocuments({ status: "ACTIVE" }),
      // Response time = dispatchedAt → acknowledgedAt, over completed/acknowledged
      // dispatches in the last 24h.
      EmergencyDispatch.find({
        dispatchedAt: { $gte: since },
        acknowledgedAt: { $ne: null },
      })
        .select("dispatchedAt acknowledgedAt completedAt etaMinutes")
        .lean(),
    ]);

  const beds = { available: 0, on_dispatch: 0, offline: 0, maintenance: 0 } as Record<string, number>;
  ambAgg.forEach((a: any) => { beds[a._id] = a.count; });
  const totalAmb = beds.available + beds.on_dispatch + beds.offline + beds.maintenance;

  // Average acknowledge response time (minutes).
  let avgResponseMin = 0;
  if (recent.length) {
    const total = recent.reduce((s: number, d: any) => {
      const ms = new Date(d.acknowledgedAt).getTime() - new Date(d.dispatchedAt).getTime();
      return s + Math.max(0, ms / 60000);
    }, 0);
    avgResponseMin = Math.round((total / recent.length) * 10) / 10;
  }

  req.rData = {
    fleet: {
      total: totalAmb,
      available: beds.available,
      onDispatch: beds.on_dispatch,
      offline: beds.offline,
      maintenance: beds.maintenance,
      availabilityPct: totalAmb ? Math.round((beds.available / totalAmb) * 100) : 0,
    },
    crew: { onDuty: onDutyCrew },
    load: {
      activeDispatches,
      activeRequests,
      activeSos,
    },
    response: {
      avgAcknowledgeMinutes: avgResponseMin,
      sampleSize: recent.length,
      windowHours: 24,
    },
  };
  req.msg = "success";
  return next();
};
