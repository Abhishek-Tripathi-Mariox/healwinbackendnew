import Admission from "../models/admission.model";
import EmrEncounter from "../models/emr-encounter.model";

/**
 * Medication Administration Record (MAR) — turns a patient's IPD
 * prescriptions into a real, checkable dosing schedule instead of the
 * previous flat, unlinked medicationLog (any drug name could be logged,
 * with no way to tell whether it matched what the doctor actually
 * prescribed, or whether a scheduled dose was ever given at all).
 */

// Standard ward dosing round times — morning / afternoon / night.
const SLOT_TIMES = ["08:00", "14:00", "20:00"];

/**
 * Parse a frequency code into scheduled HH:mm times. Supports the
 * "1-0-1" (morning-afternoon-night) notation used elsewhere in this
 * codebase (see IPrescription's own doc comment) as well as common Latin
 * abbreviations. Unrecognised/as-needed (SOS/STAT) frequencies return no
 * scheduled times — they're not part of a fixed dosing round.
 */
const parseFrequency = (freq?: string): string[] => {
  const raw = String(freq || "").trim();
  if (!raw) return [];
  const parts = raw.split("-").map((p) => p.trim());
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    return parts
      .map((p, i) => (Number(p) > 0 ? SLOT_TIMES[i] : null))
      .filter((t): t is string => !!t);
  }
  const LATIN: Record<string, string[]> = {
    OD: ["08:00"],
    BD: ["08:00", "20:00"],
    TDS: ["08:00", "14:00", "20:00"],
    TID: ["08:00", "14:00", "20:00"],
    QID: ["06:00", "12:00", "18:00", "00:00"],
    HS: ["20:00"],
  };
  return LATIN[raw.toUpperCase()] || [];
};

/** Parse a duration string like "5 days" / "5d" into a day count, or null if unparseable (treated as ongoing). */
const parseDurationDays = (dur?: string): number | null => {
  const m = String(dur || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

export interface MarDose {
  drug: string;
  dosage?: string;
  time: string; // "HH:mm"
  scheduledAt: string; // ISO
  status: "given" | "overdue" | "upcoming";
  givenAt?: string;
  givenBy?: string;
  prescribedBy?: string;
  encounterId: string;
}

/**
 * Today's (or any given date's) medication schedule for an admission: every
 * active IPD prescription's scheduled doses for that day, cross-referenced
 * against the admission's medicationLog entries to mark each dose given,
 * overdue, or still upcoming.
 */
export const getMarForDate = async (admissionId: any, date: Date): Promise<MarDose[]> => {
  const admission: any = await Admission.findById(admissionId)
    .select("patientId admittedAt medicationLog")
    .populate("medicationLog.administeredByAdminId", "fullName")
    .lean();
  if (!admission) return [];

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const encounters: any[] = await EmrEncounter.find({
    patientId: admission.patientId,
    encounterType: "IPD",
    visitDate: { $gte: admission.admittedAt, $lte: dayEnd },
  })
    .populate("doctorId", "fullName")
    .sort({ visitDate: 1 })
    .lean();

  // Doses already logged on this date, by drug (case-insensitive). Each is
  // consumed at most once as we walk scheduled doses in time order below, so
  // two doses of the same drug on the same day match two separate log entries.
  const loggedToday = (admission.medicationLog || [])
    .filter((m: any) => {
      const t = new Date(m.at).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    })
    .map((m: any) => ({
      drug: String(m.drug || "").toLowerCase().trim(),
      at: m.at,
      by: m.administeredByAdminId?.fullName as string | undefined,
      used: false,
    }));

  const doses: MarDose[] = [];
  for (const enc of encounters) {
    const startDay = new Date(enc.visitDate);
    startDay.setHours(0, 0, 0, 0);
    const dayIndex = Math.round((dayStart.getTime() - startDay.getTime()) / 86400000);
    if (dayIndex < 0) continue; // prescribed after this date

    for (const rx of enc.prescriptions || []) {
      const days = parseDurationDays(rx.duration);
      if (days != null && dayIndex >= days) continue; // course already finished

      for (const time of parseFrequency(rx.frequency)) {
        const [h, m] = time.split(":").map(Number);
        const scheduledAt = new Date(dayStart);
        scheduledAt.setHours(h, m, 0, 0);

        const match = loggedToday.find((l: any) => !l.used && l.drug === String(rx.drug).toLowerCase().trim());
        let status: MarDose["status"] = "upcoming";
        let givenAt: string | undefined;
        let givenBy: string | undefined;
        if (match) {
          match.used = true;
          status = "given";
          givenAt = new Date(match.at).toISOString();
          givenBy = match.by;
        } else if (scheduledAt.getTime() < Date.now()) {
          status = "overdue";
        }

        doses.push({
          drug: rx.drug,
          dosage: rx.dosage,
          time,
          scheduledAt: scheduledAt.toISOString(),
          status,
          givenAt,
          givenBy,
          prescribedBy: enc.doctorId?.fullName,
          encounterId: String(enc._id),
        });
      }
    }
  }

  return doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
};
