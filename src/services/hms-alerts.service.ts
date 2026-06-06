import InventoryItem from "../models/inventory-item.model";
import Appointment from "../models/appointment.model";

/**
 * Doctor Panel / HMS operational alerts — computed live from the DB:
 *   • lowStock      — inventory at/below its reorder threshold
 *   • expiringSoon  — consumables/medicines expiring within 30 days
 *   • followUps     — OPD follow-ups due within the next 2 days
 *
 * Used both by the admin alerts endpoint (surfaced in the header bell) and by
 * a lightweight periodic scheduler (a hook point for future email/push).
 */
const EXPIRY_WINDOW_DAYS = 30;
const FOLLOWUP_WINDOW_DAYS = 2;

export const computeHmsAlerts = async () => {
  const now = new Date();
  const expiryCutoff = new Date(
    now.getTime() + EXPIRY_WINDOW_DAYS * 86_400_000,
  );
  const followUpCutoff = new Date(
    now.getTime() + FOLLOWUP_WINDOW_DAYS * 86_400_000,
  );
  const followUpFloor = new Date(now.getTime() - 30 * 86_400_000);

  const [lowStock, expiringSoon, followUps] = await Promise.all([
    InventoryItem.find({
      isDeleted: false,
      isActive: true,
      $expr: { $lte: ["$currentStock", "$reorderThreshold"] },
    })
      .select("name category currentStock reorderThreshold")
      .limit(100)
      .lean(),
    InventoryItem.find({
      isDeleted: false,
      isActive: true,
      expiryDate: { $ne: null, $lte: expiryCutoff },
    })
      .select("name category expiryDate currentStock")
      .sort({ expiryDate: 1 })
      .limit(100)
      .lean(),
    Appointment.find({
      status: { $nin: ["cancelled", "completed"] },
      followUpAt: { $gte: followUpFloor, $lte: followUpCutoff },
    })
      .select("followUpAt patientId")
      .populate("patientId", "fullName patientId")
      .sort({ followUpAt: 1 })
      .limit(100)
      .lean(),
  ]);

  return {
    counts: {
      lowStock: lowStock.length,
      expiringSoon: expiringSoon.length,
      followUps: followUps.length,
      total: lowStock.length + expiringSoon.length + followUps.length,
    },
    lowStock,
    expiringSoon,
    followUps,
  };
};

let timer: NodeJS.Timeout | null = null;

/**
 * Periodically recompute alerts and log a summary. Runs once shortly after
 * boot, then every 6 hours. Console output is the integration seam where an
 * email/push digest can be wired in later without changing callers.
 */
export const startHmsAlertScheduler = () => {
  if (timer) return;
  const tick = async () => {
    try {
      const a = await computeHmsAlerts();
      if (a.counts.total > 0) {
        console.log(
          `[HMS alerts] low-stock=${a.counts.lowStock} expiring=${a.counts.expiringSoon} follow-ups=${a.counts.followUps}`,
        );
      }
    } catch (e) {
      console.error("[HMS alerts] compute failed:", e);
    }
  };
  // First run a minute after boot (let connections settle), then every 6h.
  setTimeout(tick, 60_000);
  timer = setInterval(tick, 6 * 60 * 60 * 1000);
};
